# Store privacy inventory — reconciliation draft

This inventory is deliberately conservative. Before submission, compare it with the final binaries, backend request logs, database schema, nutrition provider contracts, crash reporting, analytics, authentication, and payment processors.

| Data or capability | Initial native behavior | Store disclosure action |
| --- | --- | --- |
| Account identifier/email | Backend-dependent; not implemented by this native kit | Declare identifiers/contact info if accounts ship |
| Workout history | User-provided and app-generated | Declare fitness data linked to account if synced |
| Food diary/photo | Provider-dependent | Declare health/fitness and photos if uploaded |
| Daily steps/active energy | Optional aggregate read after system permission | Declare health/fitness data; never advertising/tracking |
| Completed workout export | Not present in the initial native bridge; no health write permission is requested | Add a new disclosure and just-in-time permission only if a separately reviewed export action ships |
| Coach transcript | Bounded text path; backend-dependent | Declare user content if sent or retained |
| Microphone | Native recognition input only after permission; raw audio not retained by FitCoach | Declare permission and any OS/provider processing honestly |
| Voice reply text | May be sent to speech provider by server | Declare processor and retention in policy |
| Progress photos | Private by default; backend-dependent | Declare photos and user content if synced |
| Purchases | Apple/Google plus entitlement backend | Declare purchase history if linked to account |
| Diagnostics | No crash SDK selected in this kit | Reconcile after selecting a production SDK |
| Advertising/tracking | None; advertising ID is not requested | Select no tracking only if final dependency scan confirms it |

## Apple submission

- Public privacy policy URL is required.
- App Privacy answers must include first-party and third-party data practices.
- HealthKit is used only for clear health/fitness purposes and never for advertising, data brokerage, or sale.
- Generate the final privacy report in Xcode and replace the conservative `PrivacyInfo.xcprivacy` template with declarations matching the compiled SDK graph.

## Google Play submission

- Public non-PDF, non-geofenced privacy policy URL is required in Play Console and in-app.
- Complete Data safety, Health apps, Target audience/content, App access, and Account deletion declarations.
- Health Connect permissions must match the minimum data types visible in the app. Unused permissions must be removed before upload.
- The console declaration and this document do not substitute for a production privacy policy.
