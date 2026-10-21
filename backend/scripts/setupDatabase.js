import dotenv from 'dotenv'
import { Client } from 'pg'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))
const backendDirectory = path.resolve(scriptDirectory, '..')
const projectDirectory = path.resolve(backendDirectory, '..')
const migrationDirectory = path.join(projectDirectory, 'database', 'migrations')

// Load secrets from this project even when the command is started outside its root folder.
dotenv.config({ path: path.join(backendDirectory, '.env') })

const connectionString = process.env.SUPABASE_DB_URL

if (!connectionString || connectionString.includes('your-database-password')) {
  console.error('Set SUPABASE_DB_URL in backend/.env using the Session pooler string from Supabase > Connect.')
  process.exit(1)
}

const migrationFiles = (await readdir(migrationDirectory))
  .filter((fileName) => /^\d+_.+\.sql$/i.test(fileName))
  .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }))

if (migrationFiles.length === 0) {
  console.error('No numbered SQL migration files were found in database/migrations.')
  process.exit(1)
}

const database = new Client({ connectionString })

try {
  await database.connect()
  console.log(`Connected to Supabase. Applying ${migrationFiles.length} migrations...`)

  for (const fileName of migrationFiles) {
    const sql = await readFile(path.join(migrationDirectory, fileName), 'utf8')

    // A failed migration is rolled back so it can be corrected and safely retried.
    await database.query('BEGIN')
    try {
      await database.query(sql)
      await database.query('COMMIT')
      console.log(`Applied ${fileName}`)
    } catch (error) {
      await database.query('ROLLBACK')
      throw new Error(`Migration ${fileName} failed: ${error.message}`, { cause: error })
    }
  }

  console.log('Database setup complete.')
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
} finally {
  await database.end().catch(() => {})
}

/*
CODE WALKTHROUGH
1. The script finds the project folders from its own file location, so its paths do not depend on the terminal's current folder.
2. dotenv loads the private SUPABASE_DB_URL from backend/.env; the URL is never printed.
3. It gathers numbered migration files and sorts them so tables are created before tables that depend on them.
4. The pg Client opens an encrypted PostgreSQL connection using the Session pooler URL copied from Supabase.
5. Each migration runs inside a transaction. A successful file is committed; a failed file is rolled back and its filename is shown.
6. The script closes the database connection whether it succeeds or fails.
7. This lets a student apply the supplied schema with one Node.js command without manually editing or pasting SQL.
*/
