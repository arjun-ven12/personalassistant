import AppKit
import ApplicationServices
import Darwin
import Foundation

private func attribute(_ element: AXUIElement, _ name: String) -> AnyObject? {
    var value: CFTypeRef?
    guard AXUIElementCopyAttributeValue(element, name as CFString, &value) == .success else {
        return nil
    }
    return value
}

private func text(_ element: AXUIElement, _ name: String, limit: Int) -> String? {
    guard let value = attribute(element, name) as? String else { return nil }
    let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else { return nil }
    return String(trimmed.prefix(limit))
}

private func jsonValue(_ value: String?) -> Any {
    value ?? NSNull()
}

private var accessibilityPromptRequested = false

private func accessibilityTrusted() -> Bool {
    if !accessibilityPromptRequested {
        accessibilityPromptRequested = true
        let promptKey = kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String
        return AXIsProcessTrustedWithOptions([promptKey: true] as CFDictionary)
    }
    return AXIsProcessTrusted()
}

private func emitObservation() {
    guard let application = NSWorkspace.shared.frontmostApplication,
          let bundleIdentifier = application.bundleIdentifier,
          bundleIdentifier.count >= 3 else { return }

    // The overlay is transport UI, not desktop context. Keeping its identity
    // out of the stream lets the last real foreground application remain the
    // bounded context when Alexa is invoked.
    let ignoredBundleIdentifiers: Set<String> = [
        "com.github.Electron",
        "com.alexa-control.mac-agent",
        "com.alexa-control.active-context",
        "com.alexa-control.voice-stt",
    ]
    if ignoredBundleIdentifiers.contains(bundleIdentifier) { return }

    let trusted = accessibilityTrusted()
    var windowTitle: String?
    var documentUri: String?
    var selectionText: String?
    var selectionRole: String?
    var selectionSecure = false

    if trusted {
        let appElement = AXUIElementCreateApplication(application.processIdentifier)
        if let window = attribute(appElement, kAXFocusedWindowAttribute) {
            let windowElement = window as! AXUIElement
            windowTitle = text(windowElement, kAXTitleAttribute, limit: 240)
            documentUri = text(windowElement, kAXDocumentAttribute, limit: 2_000)
        }
        if let focused = attribute(appElement, kAXFocusedUIElementAttribute) {
            let focusedElement = focused as! AXUIElement
            selectionRole = text(focusedElement, kAXRoleAttribute, limit: 80)
            selectionSecure = selectionRole == "AXSecureTextField"
            if !selectionSecure {
                selectionText = text(focusedElement, kAXSelectedTextAttribute, limit: 2_000)
            }
        }
    }

    let documentTitle = documentUri.flatMap { URL(string: $0)?.lastPathComponent }
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    let payload: [String: Any] = [
        "application": [
            "name": String((application.localizedName ?? bundleIdentifier).prefix(160)),
            "bundleIdentifier": String(bundleIdentifier.prefix(255)),
            "processIdentifier": Int(application.processIdentifier),
        ],
        "window": windowTitle.map { ["title": $0] } ?? NSNull(),
        "document": (documentTitle != nil || documentUri != nil) ? [
            "title": jsonValue(documentTitle),
            "type": NSNull(),
            "uri": jsonValue(documentUri),
        ] : NSNull(),
        "selection": (selectionText != nil || selectionSecure) ? [
            "text": jsonValue(selectionText),
            "semanticType": jsonValue(selectionRole),
            "secure": selectionSecure,
        ] : NSNull(),
        "accessibilityTrusted": trusted,
        "capturedAt": formatter.string(from: Date()),
    ]

    guard JSONSerialization.isValidJSONObject(payload),
          let data = try? JSONSerialization.data(withJSONObject: payload),
          let line = String(data: data, encoding: .utf8) else { return }
    print(line)
    fflush(stdout)
}

emitObservation()
Timer.scheduledTimer(withTimeInterval: 2.0, repeats: true) { _ in
    emitObservation()
}
if let marker = CommandLine.arguments.firstIndex(of: "--parent-pid"),
   CommandLine.arguments.indices.contains(marker + 1),
   let parentProcessId = Int32(CommandLine.arguments[marker + 1]),
   parentProcessId > 1 {
    Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { _ in
        if kill(parentProcessId, 0) != 0 && errno == ESRCH {
            exit(EXIT_SUCCESS)
        }
    }
}
RunLoop.main.run()
