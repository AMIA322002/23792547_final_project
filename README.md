# NEO:EON Website

## Overview
The NEO:EON Website is a dynamic and interactive platform that showcases articles, media, 
and additional features powered by APIs and a secure SQL database. 
This document explains the integration of the OpenWeather API, Pokémon API, 
and the use of an SQL database for fetching article data securely.

## Features
- **OpenWeather API**: Displays real-time weather data on the homepage.
- **Pokémon API**: Fetches Pokémon data for an interactive section.
- **SQL Database for Articles**: Stores and retrieves article data securely, with SQL injection prevention mechanisms.

## Requirements

- Node.js (v16 or higher recommended)
- npm (Node Package Manager)
- SQL database (e.g., MySQL, PostgreSQL, or SQLite)
- Internet connection for API access

## Project Setup

1. **Clone the Repository**
   ```bash
   git clone <repository-url>
   cd <project-directory>
   ```

2. **Install Dependencies**
   ```bash
   npm install
   ```

3. **Configure Environment Variables**
   - Create a `.env` file in the root directory.
   - Add your API keys and database credentials:
     ```
     OPENWEATHER_API_KEY=your_openweather_api_key
     POKEMON_API_URL=https://pokeapi.co/api/v2/
     DATABASE_URL=your_database_connection_string
     ```

## Running Migrations

1. **Set Up the Database**
   - Ensure your SQL database server is running.
   - Update the `DATABASE_URL` in your `.env` file.

2. **Run Migrations**
   - If using a migration tool (e.g., Sequelize, Knex, Prisma), run:
     ```bash
     npx <migration-tool> migrate
     ```
   - This will create the necessary tables for articles and other data.

## Running the Project

```bash
npm start
```
- The website will be available at `http://localhost:3000` (or your configured port).

## Testing All Features

1. **Weather Widget**
   - Visit the homepage.
   - Confirm real-time weather data is displayed.
   - Test with different locations if supported.

2. **Pokémon Section**
   - Navigate to the Pokémon section/page.
   - Search for a Pokémon or browse random entries.
   - Confirm names, types, abilities, and images are displayed.

3. **Articles**
   - Visit the articles page.
   - Confirm articles are loaded from the SQL database.
   - Test filtering/searching articles.
   - Try submitting malicious input to verify SQL injection protection.

4. **API Connectivity**
   - Disconnect from the internet and reload to confirm error handling for APIs.

## API Integration Details

### OpenWeather API
- **Setup**: Obtain an API key from [OpenWeather](https://openweathermap.org/api).
- **Configuration**: Add the key to your `.env` as `OPENWEATHER_API_KEY`.
- **Usage**: The frontend calls a backend endpoint, which fetches weather data using the key.

### Pokémon API
- **Setup**: No API key required for [PokéAPI](https://pokeapi.co/).
- **Configuration**: Ensure `POKEMON_API_URL` is set in `.env`.
- **Usage**: The frontend fetches Pokémon data directly or via a backend proxy.

### SQL Database for Articles
- **Setup**: Configure your SQL database and connection string.
- **Migrations**: Run the migration command to create the articles table.
- **Usage**: Backend uses parameterized queries to fetch and filter articles securely.

## File Structure
- **HTML Files**: Structure for individual pages (e.g., `index.html`, `article.html`).
- **CSS Files**: Styles for the website (e.g., `article.css`, `utility-style.css`).
- **JavaScript Files**: Interactivity and dynamic content loading (e.g., `main.js`).
- **SQL Database**: Stores article data securely, replacing previous CSV files.

## Security & Best Practices

- All SQL queries are parameterized to prevent SQL injection.
- User inputs are validated and sanitized.
- Sensitive data is stored securely with access controls.
- Only authorized queries can access or modify data.

## User Permissions

The system supports multiple user roles, enforced in the backend (see `server.js`):

- **Guest**: Can view public articles, weather, and Pokémon sections.
- **Registered User**: Can comment, manage interests/dislikes/subscriptions, and edit their profile.
- **Moderator**: Can delete comments (see `/api/comments/:id` DELETE endpoint).
- **Editor**: Can edit their own articles and biography.
- **Admin**: Can create, edit, or delete any article, manage users and assign roles (see `/api/admin/*` endpoints).

Role checks are implemented in the API endpoints (see `requireAdmin` and related middleware in `server.js`).

## Login & Registration Flow

The authentication flow is handled via API endpoints in the codebase:

1. **Registration**
   - Users register via `/api/register` (see `server.js`).
   - Required fields: username, email, password, country, first name, last name.
   - Passwords are hashed using bcrypt before storage.
   - The first registered user is assigned the `admin` role automatically.
   - Duplicate username/email checks are enforced.

2. **Login**
   - Users log in via `/api/login` (see `server.js`).
   - On success, user data (without password) is returned.
   - The frontend stores user info in `localStorage` or `sessionStorage` for session management.

3. **Session Management**
   - The frontend checks for user info in storage to show/hide profile, login, and logout links.
   - Logout simply removes user info from storage.

4. **Permissions Enforcement**
   - API endpoints check user roles before allowing sensitive actions (see `requireAdmin` and role checks in `server.js`).
   - Unauthorized actions return HTTP 403.

5. **Profile Management**
   - Users can update their profile via `/api/user-profile` (PUT).
   - Admins can assign roles via `/api/admin/users/:id/role`.

Refer to the `public/register.html`, `public/login.html`, and `server.js` for implementation details.

## Support

For issues or questions, please open an issue in the repository or contact the maintainer.
