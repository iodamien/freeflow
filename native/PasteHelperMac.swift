// FreeFlow PasteHelperMac - macOS counterpart of PasteHelper.exe. Posts Cmd+V
// with CoreGraphics events to the frontmost application.
//
//   PasteHelperMac [--dry-run] [--delay <ms>] [--expect-pid <pid>]
//   PasteHelperMac --info      frontmost application as JSON (no permission needed)
//
// Posting events requires the Accessibility permission of the responsible app
// (FreeFlow.app, or the terminal while developing): without it macOS drops the
// events silently, so the helper reports "blocked" instead of a fake success.
// Exit codes: 0 pasted (or dry-run), 2 blocked, 3 unexpected error.
// Build: swiftc -O -target arm64-apple-macos12 -o native/PasteHelperMac native/PasteHelperMac.swift
import AppKit
import ApplicationServices
import Carbon.HIToolbox

func emit(_ fields: [String: Any], code: Int32) -> Never {
  if let data = try? JSONSerialization.data(withJSONObject: fields, options: [.sortedKeys]),
     let line = String(data: data, encoding: .utf8) {
    print(line)
  }
  exit(code)
}

func frontmost() -> [String: Any] {
  guard let app = NSWorkspace.shared.frontmostApplication else { return [:] }
  var info: [String: Any] = ["pid": Int(app.processIdentifier)]
  if let name = app.localizedName { info["process"] = name }
  if let bundle = app.bundleIdentifier { info["bundleId"] = bundle }
  return info
}

// Virtual key that types "v" in the current layout (Dvorak, Colemak...), so the
// shortcut matches the app's Cmd+V key equivalent. Falls back to the ANSI V key.
func keyCodeForV() -> CGKeyCode {
  guard let source = TISCopyCurrentKeyboardLayoutInputSource()?.takeRetainedValue(),
        let raw = TISGetInputSourceProperty(source, kTISPropertyUnicodeKeyLayoutData) else {
    return CGKeyCode(kVK_ANSI_V)
  }
  let data = Unmanaged<CFData>.fromOpaque(raw).takeUnretainedValue() as Data
  return data.withUnsafeBytes { (buffer: UnsafeRawBufferPointer) -> CGKeyCode in
    guard let layout = buffer.bindMemory(to: UCKeyboardLayout.self).baseAddress else { return CGKeyCode(kVK_ANSI_V) }
    for code in 0..<128 {
      var dead: UInt32 = 0
      var length = 0
      var chars = [UniChar](repeating: 0, count: 4)
      let status = UCKeyTranslate(layout, UInt16(code), UInt16(kUCKeyActionDown), 0, UInt32(LMGetKbdType()),
                                  OptionBits(kUCKeyTranslateNoDeadKeysBit), &dead, chars.count, &length, &chars)
      if status == noErr && length == 1 && chars[0] == UniChar(118) { return CGKeyCode(code) }   // "v"
    }
    return CGKeyCode(kVK_ANSI_V)
  }
}

var args = Array(CommandLine.arguments.dropFirst())
func value(after flag: String) -> String? {
  guard let i = args.firstIndex(of: flag), i + 1 < args.count else { return nil }
  return args[i + 1]
}

if args.contains("--info") {
  var info = frontmost()
  info["trusted"] = AXIsProcessTrusted()
  emit(info, code: 0)
}

let dryRun = args.contains("--dry-run")
let delayMs = max(0, min(2000, Int(value(after: "--delay") ?? "") ?? 60))
let expectedPid = value(after: "--expect-pid").flatMap { Int32($0) }
let key = keyCodeForV()
var result = frontmost()
result["key"] = "cmd+v"
result["keyCode"] = Int(key)
result["delayMs"] = delayMs

if dryRun {
  result["outcome"] = "dry-run"
  emit(result, code: 0)
}
guard AXIsProcessTrusted() else {
  result["outcome"] = "blocked"
  result["error"] = "Accessibilité non autorisée pour FreeFlow"
  emit(result, code: 2)
}
usleep(useconds_t(delayMs * 1000))
if let expected = expectedPid, (frontmost()["pid"] as? Int).map({ Int32($0) }) != expected {
  result["outcome"] = "blocked"
  result["error"] = "La fenêtre active a changé"
  emit(result, code: 2)
}
guard let source = CGEventSource(stateID: .hidSystemState),
      let down = CGEvent(keyboardEventSource: source, virtualKey: key, keyDown: true),
      let up = CGEvent(keyboardEventSource: source, virtualKey: key, keyDown: false) else {
  result["outcome"] = "failed"
  result["error"] = "Impossible de créer les événements clavier"
  emit(result, code: 3)
}
// Explicit flags: modifiers the user may still hold (the dictation shortcut) must
// not turn Cmd+V into Cmd+Option+V or Cmd+Shift+V.
down.flags = .maskCommand
up.flags = .maskCommand
down.post(tap: .cghidEventTap)
usleep(8000)
up.post(tap: .cghidEventTap)
result["outcome"] = "pasted"
emit(result, code: 0)
