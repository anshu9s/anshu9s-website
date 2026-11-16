# Turning the chat on (about 10 minutes, free)

The site is plain files (HTML, CSS, JS), so it works on any normal hosting.
The chat needs a small online database. We use **Firebase** from Google, free plan.
You don't need a VPS.

## 1. Make a Firebase project
1. Go to https://console.firebase.google.com and sign in with Google.
2. **Create a project**. Any name, for example `anshu-lounge`. Turn Google Analytics off.

## 2. Switch on two things
1. **Build -> Authentication -> Get started -> Sign-in method -> Anonymous -> Enable.**
   (Visitors never see a login. This just gives each browser a private ID so a username can belong to it.)
2. **Build -> Firestore Database -> Create database.**
   Pick the location closest to your visitors (for India: `asia-south1`). Start in **production mode**.

## 3. Paste your keys
1. **Project settings (gear icon) -> Your apps -> Web (`</>`)**. Register an app, any nickname.
2. Copy the `firebaseConfig` values it shows you.
3. Open `firebase-config.js` and replace `null` with them:

```js
export const firebaseConfig = {
  apiKey: "AIza...",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project",
  appId: "1:1234567890:web:abcdef"
};
```

These keys are meant to be public. The rules in step 4 protect your data.

## 4. Publish the rules (important)
Firestore Database -> **Rules** tab -> delete everything -> paste the whole content of `firestore.rules` -> **Publish**.

This is what makes usernames unique and stops people posting as someone else. Without it the chat will not work.

## 5. Upload
Upload all the files to your hosting (`index.html`, `style.css`, `app.js`, `chat.js`, `firebase-config.js`, `avatar.webp`).
Open the site, pick a username, send a message. Done.

**Tip:** claim your own username first (for example `anshu9s`) before you share the link, so nobody else takes it.

## Trying it without Firebase
Open the page with `?demo` at the end, for example `index.html?demo`. The whole chat works, but messages stay on that device only. It's for previewing the look.

## How the rules behave
- Anyone can read the chat without any sign-up.
- To talk, a visitor picks a username. It must be 3 to 20 characters: letters, numbers, `_` and `.`.
- A username can be taken by only one person, and one browser can hold only one username. It can't be changed.
- Names like `admin`, `mod`, `moderator`, `system`, `owner`, `support`, `staff` are reserved.
- Messages are up to 500 characters and can't be edited or deleted by visitors.

## Honest limits
- The username is tied to the browser. If someone clears site data or switches browser, they become a new visitor and can claim a different username. Making it truly "one human, one name" needs a login (Google, email or phone). That can be added later.
- Someone with technical skill could script many anonymous accounts to grab usernames or spam. Firebase **App Check** (free) makes this much harder. Add it if the chat gets popular.
- You can remove a bad message or name by hand in Firebase console -> Firestore Database.
- Free plan: about 50,000 document reads a day. Each page load reads up to 60 messages, so that's roughly 800+ visitors a day before you'd need to think about it.
