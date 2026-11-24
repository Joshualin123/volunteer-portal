A school assignment in which we collaborated with community partners to build a better volunteering portal than their own.
The purpose is to give volunteers and non profit organizations a convenient way to communicate and help the community.
UI was built using Figma Make, backend is managed by Node.js and is initialized with demo data.

To setup frontend:

1. Clone the repository
2. run 'npm install vite', then 'npm fund' to download dependencies, these dependencies are in gitignore and will not be on the gitlab repo
3. run 'npm run dev' to run the website locally, the terminal will give you a link to the website (localhost:8443)

To setup backend:

cd backend
npm install dotenv
npm server.js (if dependencies not installed, it will give instructions on what commands to run to install them)
open backend at localhost:5000 if you want to see specific tables, the routes are in backend/routes.js

notes for when in production:
.env files should be in .gitignore
delete resetDemoData function in queries.js
delete insert statements for demo data, and make sure to include insert statements for admin accounts