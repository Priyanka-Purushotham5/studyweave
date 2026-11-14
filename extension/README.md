# StudyWeave Capture

1. Start the StudyWeave API and create or seed a course, exam and module.
2. Open `chrome://extensions`, turn on **Developer mode**, select **Load unpacked**, and choose this `extension` directory.
3. Open a web page or YouTube video and click **StudyWeave Capture** in the toolbar. Choose a module and select **Save current tab**.
4. Refresh StudyWeave to see the saved page.

The popup remembers the last course, exam and module. It suggests a different module when its name matches the current page title or URL. Page contents are submitted only when you save. The default API origin is `http://127.0.0.1:3000`. To connect to a deployed backend, set its HTTPS origin under **API connection**. Capture uses the live API. Use an ordinary public page to test capture because Module B validates that the submitted page URL is public.
