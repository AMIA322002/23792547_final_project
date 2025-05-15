import express from "express";
import fs from "fs";
import path from "path";
import axios from "axios";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { createConnection } from "mysql2/promise";
import bcrypt from "bcrypt";
import cors from "cors"; // 
dotenv.config();

const app = express();
const PORT = 5000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Enable CORS for all routes
app.use(cors()); 

// Middleware for serving static files
app.use(express.static("public"));
app.use(express.static(path.join(__dirname, "public")));

// Middleware to parse JSON request bodies
app.use(express.json());

// Load articles from the database
async function loadArticles() {
    try {
        const connection = await createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME,
        });

        const [rows] = await connection.execute("SELECT * FROM articles");
        rows.forEach(row => {
            articles.push({
                id: row.article_id?.toString().padStart(3, "0") || "UNKNOWN",
                title: row.headline_title || "No Title",
                description: row.short_desc || "No Description",
                content: row.article_content || "No Content",
                city: row.city || "Unknown",
            });
        });

        console.log("Articles Loaded:", articles);
        await connection.end();
    } catch (error) {
        console.error("Error loading articles from database:", error.message);
    }
}

// API Endpoints

// Get all articles
app.get("/api/articles", async (_req, res) => {
    try {
        const connection = await createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME,
        });

        const [rows] = await connection.execute("SELECT * FROM articles");
        await connection.end();
        res.json(rows);
    } catch (error) {
        console.error("Error fetching articles:", error.message);
        res.status(500).json({ error: "Failed to fetch articles" });
    }
});

// Get article by ID
app.get("/api/articles/:id", async (req, res) => {
    const articleId = req.params.id?.trim().padStart(3, "0");
    try {
        const connection = await createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME,
        });

        const [rows] = await connection.execute(
            "SELECT * FROM articles WHERE article_id = ?",
            [articleId]
        );
        await connection.end();

        if (!rows.length) {
            return res.status(404).json({ error: "Article not found" });
        }
        // Map DB fields to frontend fields
        const row = rows[0];
        const article = {
            id: row.article_id?.toString().padStart(3, "0") || "UNKNOWN",
            title: row.headline_title || "Untitled Article",
            description: row.short_desc || "",
            content: row.article_content || "Content not available",
            city: row.city || "",
            author: row.author || "",
            date: row.date || "",
            category: row.category || "",
            likes: row.likes || 0,
        };
        res.json(article);
    } catch (error) {
        console.error("Error fetching article:", error.message);
        res.status(500).json({ error: "Failed to fetch article" });
    }
});

// Create a new article
app.post("/api/articles", async (req, res) => {
    const { title, description, content, city, author, date, category, likes } = req.body;
    try {
        const connection = await createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME,
        });

        const [result] = await connection.execute(
            "INSERT INTO articles (headline_title, short_desc, article_content, city, author, date, category, likes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            [
                title || "",
                description || "",
                content || "",
                city || "",
                author || "",
                date || null,
                category || "",
                likes || 0
            ]
        );

        await connection.end();
        res.status(201).json({ id: result.insertId, message: "Article created successfully" });
    } catch (error) {
        console.error("Error creating article:", error.message);
        res.status(500).json({ error: "Failed to create article" });
    }
});

// Update an existing article
app.put("/api/articles/:id", async (req, res) => {
    const articleId = req.params.id;
    const { title, description, content, city, author, date, category, likes } = req.body;

    try {
        const connection = await createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME,
        });

        const [result] = await connection.execute(
            "UPDATE articles SET headline_title = ?, short_desc = ?, article_content = ?, city = ?, author = ?, date = ?, category = ?, likes = ? WHERE article_id = ?",
            [
                title || "",
                description || "",
                content || "",
                city || "",
                author || "",
                date || null,
                category || "",
                likes || 0,
                articleId
            ]
        );

        await connection.end();
        if (result.affectedRows === 0) {
            return res.status(404).json({ error: "Article not found" });
        }
        res.json({ message: "Article updated successfully" });
    } catch (error) {
        console.error("Error updating article:", error.message);
        res.status(500).json({ error: "Failed to update article" });
    }
});

// Delete an article
app.delete("/api/articles/:id", async (req, res) => {
    const articleId = req.params.id;

    try {
        const connection = await createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME,
        });

        const [result] = await connection.execute(
            "DELETE FROM articles WHERE article_id = ?",
            [articleId]
        );

        await connection.end();
        if (result.affectedRows === 0) {
            return res.status(404).json({ error: "Article not found" });
        }
        res.json({ message: "Article deleted successfully" });
    } catch (error) {
        console.error("Error deleting article:", error.message);
        res.status(500).json({ error: "Failed to delete article" });
    }
});

// Check if username or email exists (case-insensitive)
app.post("/api/check-username-email", async (req, res) => {
    const { username, email } = req.body;
    if (!username && !email) {
        return res.status(400).json({ error: "Username or email required" });
    }
    try {
        const connection = await createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME,
        });
        let query = "SELECT username, email FROM users WHERE ";
        let params = [];
        if (username && email) {
            query += "LOWER(username) = ? OR LOWER(email) = ?";
            params = [username.toLowerCase(), email.toLowerCase()];
        } else if (username) {
            query += "LOWER(username) = ?";
            params = [username.toLowerCase()];
        } else {
            query += "LOWER(email) = ?";
            params = [email.toLowerCase()];
        }
        const [rows] = await connection.execute(query, params);
        await connection.end();
        res.json({
            usernameTaken: rows.some(r => r.username && r.username.toLowerCase() === (username || "").toLowerCase()),
            emailTaken: rows.some(r => r.email && r.email.toLowerCase() === (email || "").toLowerCase())
        });
    } catch (error) {
        res.status(500).json({ error: "Failed to check username/email" });
    }
});

// User registration endpoint
app.post("/api/register", async (req, res) => {
    const { username, email, password, country, firstName, lastName } = req.body;

    // Log registration input for tracking (simple)
    console.log("Registration attempt:", { username, email, country });

    // Validate input
    if (!username || !email || !password || !country || !firstName || !lastName) {
        return res.status(400).json({ error: "All fields are required" });
    }

    // Validate password strength
    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
    if (!passwordRegex.test(password)) {
        return res.status(400).json({
            error: "Password must be at least 8 characters long and include uppercase, lowercase, a number, and a special character.",
        });
    }

    try {
        const connection = await createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME,
        });

        // Check if username or email already exists (case-insensitive)
        const [existingUsers] = await connection.execute(
            "SELECT * FROM users WHERE LOWER(username) = ? OR LOWER(email) = ?",
            [username.toLowerCase(), email.toLowerCase()]
        );
        if (existingUsers.length > 0) {
            await connection.end();
            const usernameExists = existingUsers.some(u => u.username.toLowerCase() === username.toLowerCase());
            const emailExists = existingUsers.some(u => u.email.toLowerCase() === email.toLowerCase());
            return res.status(400).json({
                error: usernameExists
                    ? "Username already exists"
                    : "Email already exists",
                usernameExists,
                emailExists
            });
        }

        // Check if this is the first user
        const [userCount] = await connection.execute("SELECT COUNT(*) AS count FROM users");
        const isAdmin = userCount[0].count === 0;

        // Hash password (bcrypt, NIST 800-132 compliant)
        const saltRounds = 12;
        const hashedPassword = await bcrypt.hash(password, saltRounds);

        // Insert new user into the database
        const [result] = await connection.execute(
            "INSERT INTO users (username, email, password, country, first_name, last_name, is_admin) VALUES (?, ?, ?, ?, ?, ?, ?)",
            [username, email.toLowerCase(), hashedPassword, country, firstName, lastName, isAdmin]
        );

        await connection.end();

        // Simulate sending a welcome email
        console.log(`Welcome email sent to ${email}`);

        res.status(201).json({
            message: "User registered successfully",
            userId: result.insertId,
            isAdmin,
        });
    } catch (error) {
        console.error("Error registering user:", error.message);
        res.status(500).json({ error: "Failed to register user" });
    }
});

// Get user profile data
app.get('/api/user-profile', async (req, res) => {
    const userId = req.query.userId || 1; // Replace with actual user authentication logic
    try {
        const connection = await createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME,
        });

        const [rows] = await connection.execute(
            'SELECT username, interests, city FROM users WHERE id = ?',
            [userId]
        );

        await connection.end();

        if (rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json(rows[0]);
    } catch (error) {
        console.error('Error fetching user profile:', error.message);
        res.status(500).json({ error: 'Failed to fetch user profile' });
    }
});

// API to fetch media for a specific article
app.get("/api/media/:articleId", async (req, res) => {
    const articleId = req.params.articleId.trim();
    console.log("Requested media for article ID:", articleId);

    try {
        const connection = await createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME,
        });

        const [rows] = await connection.execute(
            "SELECT name, `description`, file_type, css_class, filepath FROM visuallist WHERE article_id = ?",
            [articleId]
        );

        await connection.end();

        if (rows.length === 0) {
            console.log(`No media found for article ID ${articleId}`);
            return res.status(404).json({ error: "No media found for this article" });
        }

        // Map DB fields to frontend fields
        const visuals = rows.map(row => ({
            name: row.name || "No Name",
            description: row.description || "",
            file_type: row.file_type || "", // match frontend expectation
            css_class: row.css_class || "",
            filepath: row.filepath || ""
        }));

        res.json(visuals);
    } catch (error) {
        console.error("Error fetching media from database:", error.message);
        res.status(500).json({ error: "Failed to fetch media" });
    }
});

// Function to check database connection before starting the server
async function checkDatabaseConnection() {
    try {
        const connection = await createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME,
        });
        await connection.ping();
        await connection.end();
        console.log("Database connection successful.");
    } catch (error) {
        console.error("Failed to connect to the database:", error.message);
        process.exit(1); // Exit if DB connection fails
    }
}

// Initialize server
async function initializeServer() {
    await checkDatabaseConnection();
    // No need to call loadArticles/loadVisuals for in-memory arrays
    app.listen(PORT, () => {
        console.log(`Server running on http://localhost:${PORT}`);
    });
}

initializeServer();