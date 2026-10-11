# iOS app setup checklist

The code side of the App Store prep is done. These steps need your Mac, your Apple account and your Firebase project. Do them in order.

## 1. Update the project

```bash
npm install            # picks up the new plugins (Firebase messaging, Browser)
npx cap sync ios       # regenerates the iOS plugin list
```

Run `npx cap sync ios` again any time you change `capacitor.config.json` or add or remove a Capacitor plugin.

## 2. Database and server

- [ ] In the Supabase SQL Editor, run `sql/add-account-deletion.sql`. Without it, "Delete my account" fails for anyone who has hosted a season or joined one.
- [ ] Make sure Vercel has `SUPABASE_SERVICE_ROLE_KEY` set (the delete-account route needs it).
- [ ] Deploy to Vercel. The app loads the live site, so the new privacy page, account deletion and push handling only reach the app once they're deployed.

## 3. Apple Developer account

- [ ] At developer.apple.com, go to Certificates, IDs & Profiles → Identifiers, register `com.panopticon.app` and tick **Push Notifications**.
- [ ] Under Keys, create a key with **Apple Push Notifications service (APNs)** enabled. Download the `.p8` file (you can only download it once) and note the Key ID and your Team ID.

## 4. Firebase

- [ ] Firebase console → your project → Project settings → Cloud Messaging → Apple app configuration: upload the `.p8` key with its Key ID and Team ID.
- [ ] Project settings → General → Add app → iOS, bundle ID `com.panopticon.app`. Download `GoogleService-Info.plist`.
- [ ] Copy `GoogleService-Info.plist` into `ios/App/App/` **using Finder**, not by dragging it into Xcode. The Xcode project already references that exact filename, so dragging it in would add it twice.
- [ ] Project settings → Service accounts → Generate new private key. Paste the whole JSON as a single line into the Vercel env var `FIREBASE_SERVICE_ACCOUNT_JSON`.

> The app won't build without `GoogleService-Info.plist`, and it crashes on launch if the file is missing. That's expected: add the file first.

## 5. Xcode

```bash
npx cap open ios
```

- [ ] Select the **App** target → Signing & Capabilities → choose your Team. Bundle ID: `com.panopticon.app`.
- [ ] Check that **Push Notifications** and **Background Modes → Remote notifications** both appear. They're already set in `App.entitlements` and `Info.plist`; if Xcode shows a warning, click its Fix button.
- [ ] Replace the app icon: `App/Assets.xcassets/AppIcon`, a single 1024×1024 PNG with **no transparency**. The current one is Capacitor's placeholder.
- [ ] Optional: update the launch screen (`Base.lproj/LaunchScreen.storyboard`) to match the dark background.
- [ ] Decide on iPad. The app is currently set to run on iPhone **and** iPad, so Apple will review it on an iPad and ask for iPad screenshots. To ship iPhone-only for v1, go to the App target → General → Supported Destinations and remove iPad.

## 6. Test on a real iPhone (the simulator can't receive push)

- [ ] The app opens to the live site, and the Home/Login screens look right around the notch and the home bar.
- [ ] Airplane mode → relaunch → you should see the "Can't connect" screen. Turn the connection back on → it reconnects.
- [ ] Options → Notifications → turn on → iOS permission prompt → allow. In Supabase, a row should appear in `native_push_tokens` with `platform = ios`.
- [ ] Get someone to message you, or advance a round, with the app closed → the notification arrives → tapping it opens the right screen.
- [ ] Upload a portrait using both "Take Photo" and "Photo Library". The permission prompts should show the new wording.
- [ ] Pan's Panic → the microphone prompt appears → the game reacts to your voice.
- [ ] Help tab → Terms / Privacy open in an in-app sheet with a Done button.
- [ ] Profile → Delete my account, using a throwaway account. Also check that an account that's the only host of an active season gets the "archive it or add a co-host first" message.
- [ ] Host: Stereo Types Spotify widget. Spotify's web player and sign-in are unreliable inside iOS apps, so check whether this works at all.

## 7. Ship

- [ ] Product → Archive → Distribute App → App Store Connect.
- [ ] Test through TestFlight with a few real players before submitting for review.
- [ ] In App Store Connect:
  - Privacy Policy URL: `https://project-b-pink.vercel.app/privacy`
  - App Privacy answers should match `ios/App/App/PrivacyInfo.xcprivacy`: email, name, user ID, photos, other user content and gameplay content. All of them are "linked to user", none are "used for tracking", and the only purpose is App Functionality.
- [ ] **Review notes:** give a demo **player** login that's already in an active season with other players and a round in progress, plus a demo **host** login. A reviewer who can't get into a game will reject the app.

## Android (later)

- Download `google-services.json` from Firebase (add an Android app with package `com.panopticon.app`) → put it in `android/app/`.
- `npx cap sync android` → open in Android Studio → replace the launcher icons.
