import express from "express";
import path from "path";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { createConnection } from "mysql2/promise";
import bcrypt from "bcrypt";
import cors from "cors";
import NodeCache from "node-cache";
dotenv.config();

const app = express();
const PORT = 5000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// In-memory cache for articles and visuals (1 hour TTL)
const cache = new NodeCache({ stdTTL: 3600 });

// Enable CORS for all routes
app.use(cors()); 

// Middleware for serving static files
app.use(express.static("public"));
app.use(express.static(path.join(__dirname, "public")));

// Middleware to parse JSON request bodies
app.use(express.json());

// Helper: map DB article fields to frontend fields
function mapArticleFields(row) {
    return {
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
}

// Helper: map DB visual fields to frontend fields
function mapVisualFields(rows) {
    return rows.map(row => ({
        name: row.name || "No Name",
        description: row.description || "",
        file_type: row.file_type || "",
        css_class: row.css_class || "",
        filepath: row.filepath || ""
    }));
}

// Prefetch all articles into cache
async function prefetchArticles() {
    try {
        const connection = await createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME,
        });

        const [rows] = await connection.execute("SELECT * FROM articles");
        await connection.end();

        cache.set("all_articles", rows);
        rows.forEach(article => {
            const articleId = article.article_id?.toString().padStart(3, "0") || "UNKNOWN";
            cache.set(`article_${articleId}`, article);
        });
    } catch (error) {
        console.error("Error prefetching articles:", error.message);
        throw error;
    }
}

// Prefetch all visuals into cache
async function prefetchVisuals() {
    try {
        const connection = await createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME,
        });

        const [rows] = await connection.execute("SELECT * FROM visuallist");
        await connection.end();

        cache.set("all_visuals", rows);
        const visualsByArticle = {};
        rows.forEach(visual => {
            const articleId = visual.article_id?.toString().trim() || "UNKNOWN";
            if (!visualsByArticle[articleId]) {
                visualsByArticle[articleId] = [];
            }
            visualsByArticle[articleId].push(visual);
        });
        Object.entries(visualsByArticle).forEach(([articleId, visuals]) => {
            cache.set(`visuals_${articleId}`, visuals);
        });
    } catch (error) {
        console.error("Error prefetching visuals:", error.message);
        throw error;
    }
}

// Prefetch all comments into cache (simple, not required but for demo)
async function prefetchComments() {
    try {
        const connection = await createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME,
        });
        const [rows] = await connection.execute("SELECT * FROM comments");
        await connection.end();
        cache.set("all_comments", rows);
        // Group by article_id
        const commentsByArticle = {};
        rows.forEach(comment => {
            const articleId = comment.article_id?.toString().padStart(3, "0") || "UNKNOWN";
            if (!commentsByArticle[articleId]) commentsByArticle[articleId] = [];
            commentsByArticle[articleId].push(comment);
        });
        Object.entries(commentsByArticle).forEach(([articleId, comments]) => {
            cache.set(`comments_${articleId}`, comments);
        });
    } catch (error) {
        console.error("Error prefetching comments:", error.message);
    }
}

// API Endpoints

// Get all articles (use cache)
app.get("/api/articles", async (_req, res) => {
    try {
        const cachedArticles = cache.get("all_articles");
        if (cachedArticles) {
            //console.log("Serving articles from cache");
            return res.json(cachedArticles);
        }
        // fallback to DB
        const connection = await createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME,
        });

        const [rows] = await connection.execute("SELECT * FROM articles");
        await connection.end();

        cache.set("all_articles", rows);
        res.json(rows);
    } catch (error) {
        console.error("Error fetching articles:", error.message);
        res.status(500).json({ error: "Failed to fetch articles" });
    }
});

// Get article by ID (use cache)
app.get("/api/articles/:id", async (req, res) => {
    const articleId = req.params.id?.trim().padStart(3, "0");
    try {
        const cachedArticle = cache.get(`article_${articleId}`);
        if (cachedArticle) {
            //console.log(`Serving article ${articleId} from cache`);
            return res.json(mapArticleFields(cachedArticle));
        }
        // fallback to DB
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
        const article = rows[0];
        cache.set(`article_${articleId}`, article);
        res.json(mapArticleFields(article));
    } catch (error) {
        console.error("Error fetching article:", error.message);
        res.status(500).json({ error: "Failed to fetch article" });
    }
});

// Create a new article (invalidate cache)
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
        // Invalidate cache
        cache.del("all_articles");
        // Can't invalidate individual article cache since we don't know the ID yet

        res.status(201).json({ id: result.insertId, message: "Article created successfully" });
    } catch (error) {
        console.error("Error creating article:", error.message);
        res.status(500).json({ error: "Failed to create article" });
    }
});

// Update an existing article (invalidate cache)
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
        // Invalidate cache
        const paddedId = articleId?.toString().padStart(3, "0");
        cache.del("all_articles");
        cache.del(`article_${paddedId}`);

        res.json({ message: "Article updated successfully" });
    } catch (error) {
        console.error("Error updating article:", error.message);
        res.status(500).json({ error: "Failed to update article" });
    }
});

// Delete an article (invalidate cache)
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
        // Invalidate cache
        const paddedId = articleId?.toString().padStart(3, "0");
        cache.del("all_articles");
        cache.del(`article_${paddedId}`);
        cache.del(`visuals_${paddedId}`);

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
    const { username, email, password, country, firstName, lastName, biography } = req.body;

    // Log registration input for tracking (simple)
    console.log("Registration attempt:", { username, email, country, firstName, lastName, password: !!password });

    // Validate input
    if (!username || !email || !password || !country || !firstName || !lastName) {
        console.log("Missing fields:", { username, email, password, country, firstName, lastName });
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
        let assignedRole = "user";
        if (userCount[0].count === 0) {
            assignedRole = "admin";
        }

        // Hash password (bcrypt, NIST 800-132 compliant)
        const saltRounds = 12;
        const hashedPassword = await bcrypt.hash(password, saltRounds);

        // Insert new user into the database
        const [result] = await connection.execute(
            "INSERT INTO users (username, email, password, country, firstname, lastname, role, biography) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            [username, email.toLowerCase(), hashedPassword, country, firstName, lastName, assignedRole, biography || null]
        );

        await connection.end();

        // Simulate sending a welcome email
        console.log(`Welcome email sent to ${email}`);

        res.status(201).json({
            message: "User registered successfully",
            userId: result.insertId,
            role: assignedRole,
        });
    } catch (error) {
        console.error("Error registering user:", error.message);
        res.status(500).json({ error: "Failed to register user" });
    }
});

// User login endpoint
app.post("/api/login", async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
        return res.status(400).json({ error: "Email and password are required" });
    }
    try {
        const connection = await createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME,
        });

        // Find user by email (case-insensitive)
        const [users] = await connection.execute(
            "SELECT * FROM users WHERE LOWER(email) = ?",
            [email.toLowerCase()]
        );
        await connection.end();

        if (!users.length) {
            return res.status(401).json({ error: "Invalid email or password" });
        }
        const user = users[0];
        const passwordMatch = await bcrypt.compare(password, user.password);
        if (!passwordMatch) {
            return res.status(401).json({ error: "Invalid email or password" });
        }
        // Remove password before sending user object
        const { password: _, ...userWithoutPassword } = user;
        res.json({ user: userWithoutPassword });
    } catch (error) {
        console.error("Login error:", error.message);
        res.status(500).json({ error: "Failed to login" });
    }
});

// Middleware to check admin role
// Admin: assign role to user
app.post("/api/admin/assign-role", requireAdmin, async (req, res) => {
    const { targetUserId, role } = req.body;
    if (!targetUserId || !["admin", "editor", "moderator", "user"].includes(role)) {
        return res.status(400).json({ error: "Invalid input" });
    }
    try {
        const connection = await createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME,
        });
        await connection.execute("UPDATE users SET role = ? WHERE id = ?", [role, targetUserId]);
        await connection.end();
        res.json({ message: "Role updated" });
    } catch (error) {
        res.status(500).json({ error: "Failed to update role" });
    }
});

// Editor: update biography
app.put("/api/editor/biography", async (req, res) => {
    const { userId, biography } = req.body;
    if (!userId || !biography) return res.status(400).json({ error: "Missing input" });
    try {
        const connection = await createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME,
        });
        // Only allow if user is editor
        const [rows] = await connection.execute("SELECT role FROM users WHERE id = ?", [userId]);
        if (!rows.length || rows[0].role !== "editor") {
            await connection.end();
            return res.status(403).json({ error: "Editor only" });
        }
        await connection.execute("UPDATE users SET biography = ? WHERE id = ?", [biography, userId]);
        await connection.end();
        res.json({ message: "Biography updated" });
    } catch (error) {
        res.status(500).json({ error: "Failed to update biography" });
    }
});

// Update user profile (name, email)
app.put("/api/user-profile", async (req, res) => {
    const { userId, username, email } = req.body;
    if (!userId || !username || !email) {
        return res.status(400).json({ error: "Missing userId, username, or email" });
    }
    try {
        const connection = await createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME,
        });

        // Check for email/username conflict (excluding self)
        const [conflicts] = await connection.execute(
            "SELECT id FROM users WHERE (LOWER(username) = ? OR LOWER(email) = ?) AND id != ?",
            [username.toLowerCase(), email.toLowerCase(), userId]
        );
        if (conflicts.length > 0) {
            await connection.end();
            return res.status(400).json({ error: "Username or email already in use." });
        }

        await connection.execute(
            "UPDATE users SET username = ?, email = ? WHERE id = ?",
            [username, email.toLowerCase(), userId]
        );
        await connection.end();
        res.json({ message: "Profile updated successfully" });
    } catch (error) {
        res.status(500).json({ error: "Failed to update profile" });
    }
});

// Get user profile by userId (for profile page)
app.get("/api/user-profile", async (req, res) => {
    const userId = req.query.userId;
    if (!userId) {
        return res.status(400).json({ error: "Missing userId" });
    }
    try {
        const connection = await createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME,
        });
        const [rows] = await connection.execute(
            "SELECT username, email, country, interests FROM users WHERE id = ?",
            [userId]
        );
        await connection.end();
        if (!rows.length) {
            return res.status(404).json({ error: "User not found" });
        }
        res.json(rows[0]);
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch user profile" });
    }
});

// Article CRUD: permission checks
// Example for update (repeat for create/delete as needed)
app.put("/api/articles/:id", async (req, res) => {
    const articleId = req.params.id;
    const { userId, ...articleData } = req.body;
    if (!userId) return res.status(403).json({ error: "Forbidden" });
    try {
        const connection = await createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME,
        });
        // Get user role and article author
        const [[user], [article]] = await Promise.all([
            connection.execute("SELECT role, username FROM users WHERE id = ?", [userId]).then(r => r[0]),
            connection.execute("SELECT author FROM articles WHERE article_id = ?", [articleId]).then(r => r[0])
        ]);
        if (!user) {
            await connection.end();
            return res.status(403).json({ error: "Forbidden" });
        }
        if (user.role === "admin" || (user.role === "editor" && article && article.author === user.username)) {
            // ...existing update logic...
            // ...existing code...
        } else {
            await connection.end();
            return res.status(403).json({ error: "No permission" });
        }
    } catch (error) {
        // ...existing error handling...
    }
});

// Moderator: delete comment
app.delete("/api/comments/:id", async (req, res) => {
    const { userId } = req.body;
    const commentId = req.params.id;
    if (!userId) return res.status(403).json({ error: "Forbidden" });
    try {
        const connection = await createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME,
        });
        const [rows] = await connection.execute("SELECT role FROM users WHERE id = ?", [userId]);
        if (!rows.length || rows[0].role !== "moderator") {
            await connection.end();
            return res.status(403).json({ error: "Moderator only" });
        }
        await connection.execute("DELETE FROM comments WHERE id = ?", [commentId]);
        await connection.end();
        res.json({ message: "Comment deleted" });
    } catch (error) {
        res.status(500).json({ error: "Failed to delete comment" });
    }
});
function requireAdmin(req, res, next) {
    // Assume user info is attached to req.user (add real auth later)
    // For now, get userId from query or body and fetch role
    const userId = req.body.userId || req.query.userId;
    if (!userId) return res.status(403).json({ error: "Forbidden" });
    createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
    }).then(async connection => {
        const [rows] = await connection.execute("SELECT role FROM users WHERE id = ?", [userId]);
        await connection.end();
        if (rows.length && rows[0].role === "admin") {
            next();
        } else {
            res.status(403).json({ error: "Admin only" });
        }
    }).catch(() => res.status(500).json({ error: "DB error" }));
}
// Assign role to user (admin only)
app.post('/api/admin/users/:id/role', requireAdmin, async (req, res) => {
    const { role } = req.body;
    if (!["admin", "editor", "moderator", "user"].includes(role)) {
        return res.status(400).json({ error: "Invalid role" });
    }
    await db.execute('UPDATE users SET role=? WHERE user_id=?', [role, req.params.id]);
    res.json({ success: true });
});

// Article CRUD (admin only)
app.post('/api/admin/articles', requireAdmin, async (req, res) => {
    // Logic to insert a new article, including handling the "ads field" (e.g., ad content or metadata).
    // Ensure the "ads field" is validated and stored in the database along with the article details.
    // Example: await db.execute('INSERT INTO articles (title, content, ads) VALUES (?, ?, ?)', [title, content, ads]);
    // ...insert logic...
    // Update article fields, including the "ads" field
    const { title, description, content, city, author, date, category, likes, ads } = req.body;
    if (!title || !content) {
        return res.status(400).json({ error: "Title and content are required" });
    }
try {
    const connection = await createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
    });

    const [result] = await connection.execute(
        "UPDATE articles SET headline_title = ?, short_desc = ?, article_content = ?, city = ?, author = ?, date = ?, category = ?, likes = ?, ads = ? WHERE article_id = ?",
        [
            title,
            description || "",
            content,
            city || "",
            author || "",
            date || null,
            category || "",
            likes || 0,
            ads || null,
            req.params.id
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

// Update article fields (including ads)
app.put('/api/admin/articles/:id', requireAdmin, async (req, res) => {
    const articleId = req.params.id;
    const { title, description, content, city, author, date, category, likes, ads } = req.body;
    if (!title || !content) {
        return res.status(400).json({ error: "Title and content are required" });
    }
    try {
        const connection = await createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME,
        });

        const [result] = await connection.execute(
            "UPDATE articles SET headline_title = ?, short_desc = ?, article_content = ?, city = ?, author = ?, date = ?, category = ?, likes = ?, ads = ? WHERE article_id = ?",
            [
                title,
                description || "",
                content,
                city || "",
                author || "",
                date || null,
                category || "",
                likes || 0,
                ads || null,
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

// Delete article
app.delete('/api/admin/articles/:id', requireAdmin, async (req, res) => {
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
        res.status(500).json({ error: "Failed to delete article" });
    }
});

// Keywords pool management (admin only)
app.post('/api/admin/keywords', requireAdmin, async (req, res) => {
    const { keyword } = req.body;
    await db.execute('INSERT INTO keywords (keyword) VALUES (?)', [keyword]);
    res.json({ success: true });
});
app.delete('/api/admin/keywords/:id', requireAdmin, async (req, res) => {
    await db.execute('DELETE FROM keywords WHERE keyword_id=?', [req.params.id]);
    res.json({ success: true });
});

// Assign keywords to article
app.post('/api/admin/articles/:id/keywords', requireAdmin, async (req, res) => {
    const { keywordIds } = req.body; // array of keyword_id
    // ...insert into article_keywords...
    res.json({ success: true });
});

// Add this route to serve media for an article
app.get("/api/media/:id", async (req, res) => {
    const articleId = req.params.id?.trim();
    if (!articleId) {
        return res.status(400).json({ error: "Missing article ID" });
    }
    // Try cache first
    let visuals = cache.get(`visuals_${articleId}`);
    if (visuals) {
        return res.json(mapVisualFields(visuals));
    }
    // Fallback to DB
    try {
        const connection = await createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME,
        });
        const [rows] = await connection.execute(
            "SELECT * FROM visuallist WHERE article_id = ?",
            [articleId]
        );
        await connection.end();
        cache.set(`visuals_${articleId}`, rows);
        res.json(mapVisualFields(rows));
    } catch (error) {
        console.error("Error fetching visuals:", error.message);
        res.status(500).json({ error: "Failed to fetch visuals" });
    }
});

// Add to user interests
app.post('/api/user/interests', async (req, res) => {
    const { userId, interest } = req.body;
    if (!userId || !interest) return res.status(400).json({ error: "Missing input" });
    const connection = await createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
    });
    await connection.execute(
        "INSERT IGNORE INTO user_interests (user_id, interest) VALUES (?, ?)",
        [userId, interest]
    );
    await connection.end();
    res.json({ success: true });
});

// Remove from user interests
app.delete('/api/user/interests', async (req, res) => {
    const { userId, interest } = req.body;
    if (!userId || !interest) return res.status(400).json({ error: "Missing input" });
    const connection = await createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
    });
    await connection.execute(
        "DELETE FROM user_interests WHERE user_id=? AND interest=?",
        [userId, interest]
    );
    await connection.end();
    res.json({ success: true });
});

// Add to user dislikes
app.post('/api/user/dislikes', async (req, res) => {
    const { userId, topic } = req.body;
    if (!userId || !topic) return res.status(400).json({ error: "Missing input" });
    const connection = await createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
    });
    await connection.execute(
        "INSERT IGNORE INTO user_dislikes (user_id, topic) VALUES (?, ?)",
        [userId, topic]
    );
    await connection.end();
    res.json({ success: true });
});

// Remove from user dislikes
app.delete('/api/user/dislikes', async (req, res) => {
    const { userId, topic } = req.body;
    if (!userId || !topic) return res.status(400).json({ error: "Missing input" });
    const connection = await createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
    });
    await connection.execute(
        "DELETE FROM user_dislikes WHERE user_id=? AND topic=?",
        [userId, topic]
    );
    await connection.end();
    res.json({ success: true });
});

// Add subscription
app.post('/api/user/subscriptions', async (req, res) => {
    const { userId, topic } = req.body;
    if (!userId || !topic) return res.status(400).json({ error: "Missing input" });
    const connection = await createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
    });
    await connection.execute(
        "INSERT IGNORE INTO user_subscriptions (user_id, topic) VALUES (?, ?)",
        [userId, topic]
    );
    await connection.end();
    res.json({ success: true });
});

// Remove subscription
app.delete('/api/user/subscriptions', async (req, res) => {
    const { userId, topic } = req.body;
    if (!userId || !topic) return res.status(400).json({ error: "Missing input" });
    const connection = await createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
    });
    await connection.execute(
        "DELETE FROM user_subscriptions WHERE user_id=? AND topic=?",
        [userId, topic]
    );
    await connection.end();
    res.json({ success: true });
});

// Get user interests, dislikes, subscriptions
app.get('/api/user/preferences', async (req, res) => {
    const userId = req.query.userId;
    if (!userId) return res.status(400).json({ error: "Missing userId" });
    const connection = await createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
    });
    const [interests] = await connection.execute(
        "SELECT interest FROM user_interests WHERE user_id=?",
        [userId]
    );
    const [dislikes] = await connection.execute(
        "SELECT topic FROM user_dislikes WHERE user_id=?",
        [userId]
    );
    const [subscriptions] = await connection.execute(
        "SELECT topic FROM user_subscriptions WHERE user_id=?",
        [userId]
    );
    await connection.end();
    res.json({
        interests: interests.map(r => r.interest),
        dislikes: dislikes.map(r => r.topic),
        subscriptions: subscriptions.map(r => r.topic)
    });
});

// Track article read and update interest count
app.post('/api/user/read-article', async (req, res) => {
    const { userId, articleId, keywords } = req.body;
    if (!userId || !articleId || !Array.isArray(keywords)) return res.status(400).json({ error: "Missing input" });
    const connection = await createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
    });
    // For each keyword, increment count in user_keyword_reads
    for (const keyword of keywords) {
        await connection.execute(
            "INSERT INTO user_keyword_reads (user_id, keyword, count) VALUES (?, ?, 1) ON DUPLICATE KEY UPDATE count = count + 1",
            [userId, keyword]
        );
        // If count >= 3, add to interests
        const [[row]] = await connection.execute(
            "SELECT count FROM user_keyword_reads WHERE user_id=? AND keyword=?",
            [userId, keyword]
        );
        if (row && row.count === 3) {
            await connection.execute(
                "INSERT IGNORE INTO user_interests (user_id, interest) VALUES (?, ?)",
                [userId, keyword]
            );
        }
    }
    await connection.end();
    res.json({ success: true });
});

// Filter articles for user (hide disliked topics, show subscriptions)
app.get('/api/user/articles', async (req, res) => {
    const userId = req.query.userId;
    if (!userId) return res.status(400).json({ error: "Missing userId" });
    const connection = await createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
    });
    // Get dislikes and subscriptions
    const [dislikes] = await connection.execute(
        "SELECT topic FROM user_dislikes WHERE user_id=?",
        [userId]
    );
    const [subscriptions] = await connection.execute(
        "SELECT topic FROM user_subscriptions WHERE user_id=?",
        [userId]
    );
    // Get all articles
    const [articles] = await connection.execute("SELECT * FROM articles");
    // Filter out disliked topics
    const dislikedTopics = dislikes.map(r => r.topic);
    const filtered = articles.filter(a =>
        !dislikedTopics.includes(a.category)
    );
    // Subscribed articles
    const subscribedTopics = subscriptions.map(r => r.topic);
    const subscribedArticles = articles.filter(a =>
        subscribedTopics.includes(a.category)
    );
    await connection.end();
    res.json({
        feed: filtered,
        subscriptions: subscribedArticles
    });
});

// Get comments for an article
app.get("/api/articles/:id/comments", async (req, res) => {
    const articleId = req.params.id?.trim().padStart(3, "0");
    try {
        const connection = await createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME,
        });
        const [rows] = await connection.execute(
            "SELECT id, article_id, username, text, created_at FROM comments WHERE article_id = ? ORDER BY created_at ASC",
            [articleId]
        );
        await connection.end();
        res.json(rows);
    } catch (error) {
        console.error("Error fetching comments:", error.message);
        res.status(500).json({ error: "Failed to fetch comments" });
    }
});

// Post a new comment for an article
app.post("/api/articles/:id/comments", async (req, res) => {
    const articleId = req.params.id?.trim().padStart(3, "0");
    const { username, text } = req.body;
    if (!username || !text) {
        return res.status(400).json({ error: "Username and comment text are required" });
    }
    try {
        const connection = await createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME,
        });
        const [result] = await connection.execute(
            "INSERT INTO comments (article_id, username, text, created_at) VALUES (?, ?, ?, NOW())",
            [articleId, username, text]
        );
        // Fetch the inserted comment
        const [rows] = await connection.execute(
            "SELECT id, article_id, username, text, created_at FROM comments WHERE id = ?",
            [result.insertId]
        );
        await connection.end();
        res.status(201).json(rows[0]);
    } catch (error) {
        console.error("Error posting comment:", error.message);
        res.status(500).json({ error: "Failed to post comment" });
    }
});

// Like/unlike an article (increment/decrement likes)
app.post("/api/articles/:id/like", async (req, res) => {
    const articleId = req.params.id?.trim().padStart(3, "0");
    const { action } = req.body;
    if (!articleId || !["like", "unlike"].includes(action)) {
        return res.status(400).json({ error: "Invalid request" });
    }
    try {
        const connection = await createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME,
        });

        // Get current likes
        const [rows] = await connection.execute(
            "SELECT likes FROM articles WHERE article_id = ?",
            [articleId]
        );
        if (!rows.length) {
            await connection.end();
            return res.status(404).json({ error: "Article not found" });
        }
        let likes = parseInt(rows[0].likes, 10) || 0;
        if (action === "like") {
            likes += 1;
        } else if (action === "unlike" && likes > 0) {
            likes -= 1;
        }
        await connection.execute(
            "UPDATE articles SET likes = ? WHERE article_id = ?",
            [likes, articleId]
        );
        await connection.end();

        // Invalidate cache for this article
        cache.del("all_articles");
        cache.del(`article_${articleId}`);

        res.json({ likes });
    } catch (error) {
        console.error("Error updating likes:", error.message);
        res.status(500).json({ error: "Failed to update likes" });
    }
});

// Middleware to require admin role
app.use("/api/admin/*", (req, res, next) => {
    const userId = req.body.userId || req.query.userId;
    if (!userId) return res.status(403).json({ error: "Forbidden" });
    createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
    }).then(async connection => {
        const [rows] = await connection.execute("SELECT role FROM users WHERE id = ?", [userId]);
        await connection.end();
        if (rows.length && rows[0].role === "admin") {
            next();
        } else {
            res.status(403).json({ error: "Admin only" });
        }
    }).catch(() => res.status(500).json({ error: "DB error" }));
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

    // Prefetch articles, visuals, and comments at startup
    try {
        console.log("Prefetching data for cache...");
        await prefetchArticles();
        await prefetchVisuals();
        await prefetchComments();
        console.log("Cache warmup completed");
    } catch (error) {
        console.error("Cache warmup failed:", error.message);
    }

    app.listen(PORT, () => {
        console.log(`Server running on http://localhost:${PORT}`);
    });
}

// Call initializeServer to start the server
initializeServer();