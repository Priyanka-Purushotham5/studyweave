# StudyWeave Capture

Capture a page or YouTube video directly from its browser tab:

1. Install the extension: open `chrome://extensions`, enable **Developer mode**, choose **Load unpacked**, and select this `extension` folder. Pin **StudyWeave Capture** to the toolbar. Each teammate installs it once; it is not yet published in the Chrome Web Store.
2. Sign in to `https://studynova.ink` in Chrome and leave that tab open. Create a course, exam, and module if needed.
3. Open the page or YouTube video you want to save, click the extension icon, select a module, and click **Save current tab**. Refresh StudyNova to see it.

The popup remembers the last selection and may suggest a module based on the current page. Page text is captured and submitted only when you click save. Requests run from the signed-in StudyNova tab using its existing session, so the extension never asks for or stores the shared password. If you are signed out or have closed that tab, choose **Open StudyNova / sign in**, sign in, return to the page and try again.

The default server is `https://studynova.ink`. The optional **API connection** setting is for other HTTPS deployments or local development and may request permission for the chosen origin. Capturing a page sends its visible text and URL to the selected StudyNova server; only capture material you are authorized to share with the team. Browser-protected pages such as `chrome://` cannot be captured. Fake Gemini remains enabled in the current deployment, so AI results on arbitrary captured pages are not a verified real-model capability.
