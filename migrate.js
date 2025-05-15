import { createConnection } from 'mysql2/promise';
import csv from 'csv-parser';
import { createReadStream } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function formatDate(dateString) {
  // Add your date formatting logic here if needed
  return dateString;
}

async function migrate() {
  let connection;
  try {
    // 1. Connect to DB
    connection = await createConnection({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
    });

    // 2. Read articlelist.csv and insert into DB
    const articles = [];
    createReadStream(join(__dirname, 'data/articlelist.csv'))
      .pipe(csv())
      .on('data', (row) => {
        console.log(row); // Debugging: Log each row
        articles.push(row);
      })
      .on('end', async () => {
        let insertedCount = 0;
        let updatedCount = 0;
        let skippedCount = 0;

        for (const article of articles) {
          try {
            const [result] = await connection.execute(
              `INSERT INTO articles (article_id, headline_title, short_desc, article_content, author, date, category, likes, city, pokemon) 
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
               ON DUPLICATE KEY UPDATE
                 headline_title = VALUES(headline_title),
                 short_desc = VALUES(short_desc),
                 article_content = VALUES(article_content),
                 author = VALUES(author),
                 date = VALUES(date),
                 category = VALUES(category),
                 likes = VALUES(likes),
                 city = VALUES(city),
                 pokemon = VALUES(pokemon)`,
              [
                article['article_id'] || null,
                article['headline_title'] || null,
                article['short_desc'] || null,
                article['article_content'] || null,
                article['author'] || null,
                formatDate(article['date']) || null, // Format the date
                article['category'] || null,
                article['likes'] || null,
                article['city'] || null,
                article['pokemon'] || null,
              ]
            );

            if (result.affectedRows === 1) {
              insertedCount++;
            } else if (result.affectedRows === 2) {
              updatedCount++;
            }
          } catch (error) {
            console.error('Error processing row:', article, '\nError:', error.message);
            skippedCount++;
          }
        }

        console.log(`Migration Results:
          New records inserted: ${insertedCount}
          Existing records updated: ${updatedCount}
          Rows skipped due to errors: ${skippedCount}
          Total rows processed: ${articles.length}`);
      });
  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    if (connection) await connection.end();
  }
}

migrate();
