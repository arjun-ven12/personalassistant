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

private func children(_ element: AXUIElement) -> [AXUIElement] {
    (attribute(element, kAXChildrenAttribute) as? [AXUIElement]) ?? []
}

private struct SelectionCandidate {
    let text: String?
    let role: String?
    let secure: Bool
}

private func selectionCandidate(_ element: AXUIElement) -> SelectionCandidate? {
    let role = text(element, kAXRoleAttribute, limit: 80)
    let secure = role == "AXSecureTextField"
    if secure {
        return SelectionCandidate(text: nil, role: role, secure: true)
    }
    guard let selectedText = text(element, kAXSelectedTextAttribute, limit: 2_000) else {
        return nil
    }
    return SelectionCandidate(text: selectedText, role: role, secure: false)
}

private func findSelection(root: AXUIElement) -> SelectionCandidate? {
    var queue: [(AXUIElement, Int)] = [(root, 0)]
    var visited = 0
    while let (element, depth) = queue.first {
        queue.removeFirst()
        visited += 1
        if visited > 1_200 || depth > 16 { continue }
        if let candidate = selectionCandidate(element) {
            return candidate
        }
        for child in children(element).prefix(80) {
            queue.append((child, depth + 1))
        }
    }
    return nil
}

private let reviewedContentBundles: Set<String> = [
    "com.google.Chrome",
    "com.apple.Safari",
    "com.openai.chat",
    "com.openai.codex",
    "com.microsoft.VSCode",
]

private func boundedAccessibleContent(root: AXUIElement) -> String? {
    var queue: [(AXUIElement, Int)] = [(root, 0)]
    var visited = 0
    var seen = Set<String>()
    var lines: [String] = []
    var characterCount = 0
    let readableRoles: Set<String> = [
        "AXStaticText", "AXHeading", "AXLink", "AXButton", "AXCell",
        "AXListItem", "AXMenuItem", "AXRadioButton", "AXCheckBox"
    ]
    while let (element, depth) = queue.first {
        queue.removeFirst()
        visited += 1
        if visited > 1_500 || depth > 18 || characterCount >= 8_000 { continue }
        let role = text(element, kAXRoleAttribute, limit: 80)
        if role == "AXSecureTextField" || role == "AXTextField" || role == "AXTextArea" {
            continue
        }
        if let role, readableRoles.contains(role) {
            let candidate = text(element, kAXValueAttribute, limit: 500)
                ?? text(element, kAXTitleAttribute, limit: 500)
                ?? text(element, kAXDescriptionAttribute, limit: 500)
            if let candidate, !seen.contains(candidate) {
                seen.insert(candidate)
                lines.append(candidate)
                characterCount += candidate.count + 1
            }
        }
        for child in children(element).prefix(80) {
            queue.append((child, depth + 1))
        }
    }
    let result = String(lines.joined(separator: "\n").prefix(8_000))
    return result.isEmpty ? nil : result
}

private func jsonValue(_ value: String?) -> Any {
    value ?? NSNull()
}

private var accessibilityPromptRequested = false
private let ignoredBundleIdentifiers: Set<String> = [
    "com.github.Electron",
    "com.alexa-control.mac-agent",
    "com.alexa-control.active-context",
    "com.alexa-control.voice-stt",
]
private var lastContextApplication: NSRunningApplication?

private func accessibilityTrusted() -> Bool {
    if AXIsProcessTrusted() {
        return true
    }
    if !accessibilityPromptRequested {
        accessibilityPromptRequested = true
        let promptKey = kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String
        return AXIsProcessTrustedWithOptions([promptKey: true] as CFDictionary)
    }
    return false
}

private func emitObservation() {
    guard let frontmostApplication = NSWorkspace.shared.frontmostApplication,
          let frontmostBundleIdentifier = frontmostApplication.bundleIdentifier,
          frontmostBundleIdentifier.count >= 3 else { return }

    // The overlay is transport UI, not desktop context. Keeping its identity
    // out of the stream lets the last real foreground application remain the
    // bounded context when Alexa is invoked.
    let application: NSRunningApplication
    if ignoredBundleIdentifiers.contains(frontmostBundleIdentifier) {
        guard let previousApplication = lastContextApplication,
              !previousApplication.isTerminated,
              previousApplication.bundleIdentifier != nil else { return }
        application = previousApplication
    } else {
        application = frontmostApplication
        lastContextApplication = frontmostApplication
    }
    guard let bundleIdentifier = application.bundleIdentifier,
          bundleIdentifier.count >= 3 else { return }

    let trusted = accessibilityTrusted()
    var windowTitle: String?
    var documentUri: String?
    var documentContent: String?
    var selectionText: String?
    var selectionRole: String?
    var selectionSecure = false

    if trusted {
        let appElement = AXUIElementCreateApplication(application.processIdentifier)
        if let window = attribute(appElement, kAXFocusedWindowAttribute) {
            let windowElement = window as! AXUIElement
            windowTitle = text(windowElement, kAXTitleAttribute, limit: 240)
            documentUri = text(windowElement, kAXDocumentAttribute, limit: 2_000)
            if reviewedContentBundles.contains(bundleIdentifier) {
                documentContent = boundedAccessibleContent(root: windowElement)
            }
        }
        if let focused = attribute(appElement, kAXFocusedUIElementAttribute) {
            let focusedElement = focused as! AXUIElement
            if let candidate = selectionCandidate(focusedElement) {
                selectionText = candidate.text
                selectionRole = candidate.role
                selectionSecure = candidate.secure
            }
        }
        if selectionText == nil && !selectionSecure,
           let window = attribute(appElement, kAXFocusedWindowAttribute) {
            let windowElement = window as! AXUIElement
            if let candidate = findSelection(root: windowElement) {
                selectionText = candidate.text
                selectionRole = candidate.role
                selectionSecure = candidate.secure
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
        "document": (documentTitle != nil || documentUri != nil || documentContent != nil) ? [
            "title": jsonValue(documentTitle),
            "type": NSNull(),
            "uri": jsonValue(documentUri),
            "content": jsonValue(documentContent),
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
