import Foundation
import AuthenticationServices
import Capacitor

/// Native Sign in with Apple for CampusOS, using Apple's AuthenticationServices framework only.
/// JavaScript passes SHA-256(nonce); Supabase later verifies the raw nonce against the identity token.
@objc(CampusAppleSignInPlugin)
public class CampusAppleSignInPlugin: CAPPlugin, CAPBridgedPlugin, ASAuthorizationControllerDelegate, ASAuthorizationControllerPresentationContextProviding {
    public let identifier = "CampusAppleSignInPlugin"
    public let jsName = "CampusAppleSignIn"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "signIn", returnType: CAPPluginReturnPromise)
    ]

    private var pendingCall: CAPPluginCall?

    @objc func signIn(_ call: CAPPluginCall) {
        guard let nonce = call.getString("nonce"), nonce.count == 64 else {
            call.reject("A hashed nonce is required.")
            return
        }
        guard pendingCall == nil else {
            call.reject("Sign in with Apple is already in progress.")
            return
        }
        pendingCall = call
        DispatchQueue.main.async {
            let request = ASAuthorizationAppleIDProvider().createRequest()
            request.requestedScopes = [.fullName, .email]
            request.nonce = nonce
            let controller = ASAuthorizationController(authorizationRequests: [request])
            controller.delegate = self
            controller.presentationContextProvider = self
            controller.performRequests()
        }
    }

    public func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
        return bridge?.webView?.window ?? ASPresentationAnchor()
    }

    public func authorizationController(controller: ASAuthorizationController, didCompleteWithAuthorization authorization: ASAuthorization) {
        guard let call = pendingCall else { return }
        pendingCall = nil
        guard let credential = authorization.credential as? ASAuthorizationAppleIDCredential,
              let tokenData = credential.identityToken, let identityToken = String(data: tokenData, encoding: .utf8),
              let codeData = credential.authorizationCode, let authorizationCode = String(data: codeData, encoding: .utf8) else {
            call.reject("Apple did not return a usable credential.")
            return
        }
        var result: [String: Any] = ["identityToken": identityToken, "authorizationCode": authorizationCode]
        if let given = credential.fullName?.givenName { result["givenName"] = given }
        if let family = credential.fullName?.familyName { result["familyName"] = family }
        if let email = credential.email { result["email"] = email }
        call.resolve(result)
    }

    public func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) {
        guard let call = pendingCall else { return }
        pendingCall = nil
        if let authError = error as? ASAuthorizationError, authError.code == .canceled {
            call.reject("Sign in with Apple was cancelled.", "CANCELLED")
        } else {
            call.reject("Sign in with Apple failed: \(error.localizedDescription)")
        }
    }
}
