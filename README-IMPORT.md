Import participants into Firestore (admin)

Steps:

1) Create a Firebase service account JSON:
   - In Firebase Console → Project Settings → Service accounts → Generate new private key
   - Save the JSON as `service-account.json` in the project root (or set environment variable `GOOGLE_APPLICATION_CREDENTIALS` pointing to it)

2) Install deps and run the script (Node.js required):

```powershell
cd c:\Users\this\Desktop\newtestt
npm init -y
npm install firebase-admin
node scripts\import_participants.js
```

The script will read `data/participants.json` and create documents under the `participants` collection.

Security note: This script uses the Admin SDK and service account; keep the JSON secret safe and do not commit it to source control.
