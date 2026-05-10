import ExpoModulesCore
import DeviceCheck
import CryptoKit

/// iOS App Attest bridge.
///
/// Flow on first launch (per app install):
///   1. JS calls iosGenerateKey() → returns a base64 keyId.
///   2. JS asks server for an attestation nonce, then calls iosAttestKey({keyId, challengeHex}).
///      We hash the challenge with SHA-256 (Apple requires it), pass to attestKey().
///      Returns the base64 CBOR attestation object — server verifies and stores the public key.
///
/// Flow on every subsequent action (mining):
///   3. JS asks server for a per-action nonce, then calls iosGenerateAssertion({keyId, clientDataHex}).
///      We hash the clientData and produce an assertion. Server verifies signature against the
///      previously-stored public key, then increments the counter.
public class DeviceAttestationModule: Module {

    public func definition() -> ModuleDefinition {
        Name("ExpoDeviceAttestation")

        AsyncFunction("isAvailable") { () -> Bool in
            return DCAppAttestService.shared.isSupported
        }

        AsyncFunction("iosGenerateKey") { (promise: Promise) in
            let service = DCAppAttestService.shared
            guard service.isSupported else {
                promise.reject("UNSUPPORTED", "App Attest not supported on this device")
                return
            }
            service.generateKey { keyId, error in
                if let error = error {
                    promise.reject("KEY_GEN_FAIL", error.localizedDescription)
                    return
                }
                guard let keyId = keyId else {
                    promise.reject("KEY_GEN_FAIL", "generateKey returned no keyId")
                    return
                }
                promise.resolve(keyId)  // Apple returns base64 already
            }
        }

        AsyncFunction("iosAttestKey") { (opts: [String: Any], promise: Promise) in
            guard let keyId = opts["keyId"] as? String,
                  let challengeHex = opts["challengeHex"] as? String,
                  let challengeData = Self.hexToData(challengeHex) else {
                promise.reject("BAD_INPUT", "keyId and challengeHex required")
                return
            }
            let clientDataHash = Data(SHA256.hash(data: challengeData))
            let service = DCAppAttestService.shared
            service.attestKey(keyId, clientDataHash: clientDataHash) { attestation, error in
                if let error = error {
                    promise.reject("ATTEST_FAIL", error.localizedDescription)
                    return
                }
                guard let attestation = attestation else {
                    promise.reject("ATTEST_FAIL", "no attestation object")
                    return
                }
                let pubHash = Self.sha256Hex(of: keyId.data(using: .utf8) ?? Data())
                promise.resolve([
                    "attestationCborB64": attestation.base64EncodedString(),
                    "publicKeyHash": pubHash,
                ])
            }
        }

        AsyncFunction("iosGenerateAssertion") { (opts: [String: Any], promise: Promise) in
            guard let keyId = opts["keyId"] as? String,
                  let clientDataHex = opts["clientDataHex"] as? String,
                  let clientData = Self.hexToData(clientDataHex) else {
                promise.reject("BAD_INPUT", "keyId and clientDataHex required")
                return
            }
            let clientDataHash = Data(SHA256.hash(data: clientData))
            DCAppAttestService.shared.generateAssertion(keyId, clientDataHash: clientDataHash) { assertion, error in
                if let error = error {
                    promise.reject("ASSERTION_FAIL", error.localizedDescription)
                    return
                }
                guard let assertion = assertion else {
                    promise.reject("ASSERTION_FAIL", "no assertion object")
                    return
                }
                let pubHash = Self.sha256Hex(of: keyId.data(using: .utf8) ?? Data())
                promise.resolve([
                    "assertionCborB64": assertion.base64EncodedString(),
                    "publicKeyHash": pubHash,
                ])
            }
        }
    }

    // MARK: - Helpers
    private static func hexToData(_ hex: String) -> Data? {
        var data = Data(capacity: hex.count / 2)
        var index = hex.startIndex
        while index < hex.endIndex {
            let next = hex.index(index, offsetBy: 2, limitedBy: hex.endIndex) ?? hex.endIndex
            let byteString = hex[index..<next]
            guard let byte = UInt8(byteString, radix: 16) else { return nil }
            data.append(byte)
            index = next
        }
        return data
    }

    private static func sha256Hex(of data: Data) -> String {
        let digest = SHA256.hash(data: data)
        return digest.map { String(format: "%02x", $0) }.joined()
    }
}
