ACHAAS CAFE - OVERALL CUSTOMER WEBSITE THEME UPDATE

WHAT THIS UPDATE DOES
- The Owner Dashboard Appearance page now controls the overall CUSTOMER-FACING website theme.
- Published colours apply to the storefront's background, header, navigation, hero, buttons, menu/category cards, forms, checkout, notifications and footer.
- The theme is stored in public.cafe_settings.theme_settings.
- The customer website reads the saved theme from Supabase on page load.
- Owner dashboard styling stays independent; the appearance editor changes the customer website, not the admin panel.

FILES
Customer website:
  index.html
  style.css
  script.js
Owner dashboard:
  admin.html
  admin.css
  admin.js
Database migration:
  add-theme-settings.sql

INSTALLATION
1. Back up your existing Achaas Cafe folder.
2. In Supabase -> SQL Editor, open add-theme-settings.sql, paste the full contents, and Run it once.
   It adds theme_settings to cafe_settings. It preserves a custom theme if one has already been saved.
3. Replace the six website files in your existing website folder with the six files from this package.
4. Keep your existing images folder and its contents. Do not delete it.
5. Open admin.html and sign in.
6. Open Appearance. Select a preset or adjust the six colours, review the full storefront preview, and click Publish website theme.
7. Open or refresh index.html. It loads the published colours from cafe_settings automatically.

IMPORTANT
- The customer website uses only the Supabase URL and publishable key already configured in script.js.
- Never add the Supabase secret/service-role key to any HTML, CSS or browser JavaScript file.
- A customer page already open when the owner publishes a theme must be refreshed to load the new palette.
- Run the SQL migration before using Publish website theme. If the column already exists, the script updates the default and only replaces the known untouched starter palette.
- The files need to be served from the same website folder, with the existing images folder beside them. For testing, use a local web server rather than relying on file:// where possible.
