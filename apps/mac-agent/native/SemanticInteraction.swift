import AppKit
import ApplicationServices
import CryptoKit
import Foundation

private struct Target: Decodable {
    let type: String
    let role: String
    let label: String?
    let identifier: String?
    let semanticId: String
    let expiresAt: String
}

private struct Request: Decodable {
    let operation: String
    let bundleIdentifier: String
    let target: Target
    let text: String?
}

private struct Result: Encodable {
    let status: String
    let semanticId: String?
    let matchedCount: Int
}

private func emit(_ result: Result) -> Never {
    let encoder = JSONEncoder()
    if let data = try? encoder.encode(result) {
        FileHandle.standardOutput.write(data)
    }
    exit(EXIT_SUCCESS)
}

private func attribute(_ element: AXUIElement, _ name: String) -> AnyObject? {
    var value: CFTypeRef?
    guard AXUIElementCopyAttributeValue(element, name as CFString, &value) == .success else {
        return nil
    }
    return value
}

private func stringAttribute(_ element: AXUIElement, _ name: String) -> String? {
    guard let value = attribute(element, name) as? String else { return nil }
    let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
    return trimmed.isEmpty ? nil : String(trimmed.prefix(240))
}

private func boolAttribute(_ element: AXUIElement, _ name: String) -> Bool? {
    if let value = attribute(element, name) as? Bool { return value }
    if let value = attribute(element, name) as? NSNumber { return value.boolValue }
    return nil
}

private func semanticHash(role: String, label: String?, identifier: String?) -> String {
    let canonical = [role, label ?? "", identifier ?? ""].joined(separator: "\n")
    return SHA256.hash(data: Data(canonical.utf8)).map { String(format: "%02x", $0) }.joined()
}

private func labels(_ element: AXUIElement) -> [String] {
    [kAXTitleAttribute, kAXDescriptionAttribute, kAXHelpAttribute]
        .compactMap { stringAttribute(element, $0) }
}

private func children(_ element: AXUIElement) -> [AXUIElement] {
    (attribute(element, kAXChildrenAttribute) as? [AXUIElement]) ?? []
}

private func elements(_ element: AXUIElement, _ name: String) -> [AXUIElement] {
    (attribute(element, name) as? [AXUIElement]) ?? []
}

private func element(_ element: AXUIElement, _ name: String) -> AXUIElement? {
    guard let value = attribute(element, name),
          CFGetTypeID(value) == AXUIElementGetTypeID() else { return nil }
    return (value as! AXUIElement)
}

private func appendUnique(_ candidate: AXUIElement?, to elements: inout [AXUIElement]) {
    guard let candidate,
          !elements.contains(where: { CFEqual($0, candidate) }) else { return }
    elements.append(candidate)
}

private let reviewedComposerSubmitLabels: Set<String> = [
    "send", "send message", "send prompt", "submit"
]

private func matches(_ element: AXUIElement, _ target: Target, _ operation: String) -> Bool {
    guard stringAttribute(element, kAXRoleAttribute) == target.role else { return false }
    if let identifier = target.identifier,
       stringAttribute(element, kAXIdentifierAttribute) != identifier { return false }
    if operation == "submit_composer",
       target.type == "BUTTON",
       target.label == "Send",
       target.identifier == nil {
        return labels(element).contains {
            reviewedComposerSubmitLabels.contains($0.trimmingCharacters(in: .whitespacesAndNewlines).lowercased())
        }
    }
    if let label = target.label,
       !labels(element).contains(where: { $0.caseInsensitiveCompare(label) == .orderedSame }) {
        return false
    }
    return true
}

private func findMatches(root: AXUIElement, target: Target, operation: String) -> [AXUIElement] {
    // Chromium can report an empty AXWindows collection while still exposing
    // its browser chrome through AXFocusedWindow/AXMainWindow. Prefer those
    // reviewed structural roots and fall back to the application tree.
    var roots: [AXUIElement] = []
    appendUnique(element(root, kAXFocusedWindowAttribute), to: &roots)
    appendUnique(element(root, kAXMainWindowAttribute), to: &roots)
    for window in elements(root, kAXWindowsAttribute) {
        appendUnique(window, to: &roots)
    }
    if roots.isEmpty { roots.append(root) }
    var queue: [(AXUIElement, Int)] = roots.map {
        ($0, 0)
    }
    var found: [AXUIElement] = []
    var visited = 0
    while !queue.isEmpty && visited < 2_000 {
        let (element, depth) = queue.removeFirst()
        visited += 1
        if matches(element, target, operation) { found.append(element) }
        if depth < 20 {
            queue.append(contentsOf: children(element).map { ($0, depth + 1) })
        }
    }
    return found
}

private func accessibilityTrusted() -> Bool {
    // Ensure this launched app bundle is registered with AppKit before TCC
    // evaluates Accessibility consent for its stable signing identity.
    _ = NSApplication.shared
    if AXIsProcessTrusted() { return true }
    let promptKey = kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String
    _ = AXIsProcessTrustedWithOptions([promptKey: true] as CFDictionary)
    return false
}

guard accessibilityTrusted() else {
    emit(Result(status: "PERMISSION_DENIED", semanticId: nil, matchedCount: 0))
}
guard let data = try? FileHandle.standardInput.readToEnd(),
      let request = try? JSONDecoder().decode(Request.self, from: data) else {
    emit(Result(status: "FAILED", semanticId: nil, matchedCount: 0))
}
let formatter = ISO8601DateFormatter()
formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
guard let expiry = formatter.date(from: request.target.expiresAt), expiry > Date() else {
    emit(Result(status: "TARGET_STALE", semanticId: request.target.semanticId, matchedCount: 0))
}
guard let application = NSRunningApplication.runningApplications(
    withBundleIdentifier: request.bundleIdentifier
).first else {
    emit(Result(status: "APP_NOT_RUNNING", semanticId: nil, matchedCount: 0))
}
let root = AXUIElementCreateApplication(application.processIdentifier)
let found = findMatches(root: root, target: request.target, operation: request.operation)
guard found.count == 1, let target = found.first else {
    emit(Result(
        status: found.isEmpty ? "TARGET_NOT_FOUND" : "TARGET_AMBIGUOUS",
        semanticId: nil,
        matchedCount: found.count
    ))
}
let role = stringAttribute(target, kAXRoleAttribute) ?? request.target.role
// The reviewed composer fallback deliberately has no stable label. Bind its
// digest to the frozen request rather than provider-private dynamic AX text.
let label = request.target.label
// A reviewed fallback target intentionally has no stable identifier. Do not
// silently incorporate a provider-private runtime identifier into its frozen
// digest; matching already requires one exact visible role/label target.
let identifier = request.target.identifier
let semanticId = semanticHash(role: role, label: label, identifier: identifier)
guard semanticId == request.target.semanticId else {
    emit(Result(status: "TARGET_STALE", semanticId: semanticId, matchedCount: 1))
}
guard role != "AXSecureTextField",
      boolAttribute(target, "AXProtectedContent") != true else {
    emit(Result(status: "SECURE_TARGET_BLOCKED", semanticId: semanticId, matchedCount: 1))
}

let error: AXError
switch request.operation {
case "focus_semantic_control":
    error = AXUIElementSetAttributeValue(target, kAXFocusedAttribute as CFString, true as CFTypeRef)
case "insert_text", "replace_selection":
    guard let text = request.text else {
        emit(Result(status: "FAILED", semanticId: semanticId, matchedCount: 1))
    }
    if request.operation == "insert_text", request.target.type == "TEXT_FIELD" {
        _ = AXUIElementSetAttributeValue(target, kAXFocusedAttribute as CFString, true as CFTypeRef)
        let selectedTextError = AXUIElementSetAttributeValue(
            target,
            kAXSelectedTextAttribute as CFString,
            text as CFTypeRef
        )
        error = selectedTextError == .success
            ? .success
            : AXUIElementSetAttributeValue(target, kAXValueAttribute as CFString, text as CFTypeRef)
    } else {
        error = AXUIElementSetAttributeValue(target, kAXSelectedTextAttribute as CFString, text as CFTypeRef)
    }
case "reload", "activate_semantic_control", "submit_composer":
    error = AXUIElementPerformAction(target, kAXPressAction as CFString)
default:
    emit(Result(status: "UNSUPPORTED", semanticId: semanticId, matchedCount: 1))
}
emit(Result(
    status: error == .success ? "SUCCESS" : "FAILED",
    semanticId: semanticId,
    matchedCount: 1
))
