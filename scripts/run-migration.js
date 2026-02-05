// Example migration runner for Chinook-style schema.
// Uses generated mapping helpers from output/scripts to move data
// from Postgres to MongoDB.
//
// Requirements:
// - `sql2nosql.config.json` with `connection` and `mongodb` configured
// - `yarn analyze` has been run so output/scripts/*.migrate.js exist
// - `pg` and `mongodb` are installed (`yarn add pg mongodb` at repo root)

/* eslint-disable no-console */

const path = require("path");
const fs = require("fs");
const { Client: PgClient } = require("pg");
const { MongoClient } = require("mongodb");

// Generated mapping helpers
const Artist = require("../packages/cli/output/scripts/artist.migrate");
const Album = require("../packages/cli/output/scripts/album.migrate");

async function main() {
  // Load config
  const configPath = path.resolve(__dirname, "..", "sql2nosql.config.json");
  if (!fs.existsSync(configPath)) {
    throw new Error(`Config file not found at ${configPath}`);
  }

  const rawConfig = fs.readFileSync(configPath, "utf8");
  const config = JSON.parse(rawConfig);

  const pgConnection = config.connection;
  if (!pgConnection) {
    throw new Error("Missing Postgres connection in sql2nosql.config.json (connection).");
  }

  const mongodbConfig = config.mongodb || {};
  const mongoUri = mongodbConfig.uri || "mongodb://localhost:27017";
  const mongoDbName = mongodbConfig.database || "sql2nosql";

  console.log("Postgres:", pgConnection);
  console.log("MongoDB URI:", mongoUri);
  console.log("MongoDB DB:", mongoDbName);

  const pg = new PgClient({ connectionString: pgConnection });
  const mongoClient = new MongoClient(mongoUri);

  try {
    await pg.connect();
    await mongoClient.connect();
    const db = mongoClient.db(mongoDbName);

    // 1) Migrate artists first (base collection)
    console.log("Loading artists from Postgres...");
    const artistsRes = await pg.query("SELECT * FROM artist");
    console.log(`Found ${artistsRes.rows.length} artists.`);

    const artistsById = new Map();

    for (const row of artistsRes.rows) {
      const doc = Artist.buildArtistDoc(row);
      if (doc.artistid == null) {
        console.warn("Artist row missing artistid, skipping:", row);
        continue;
      }
      artistsById.set(doc.artistid, doc);
      await db.collection("artist").updateOne(
        { artistid: doc.artistid },
        { $set: doc },
        { upsert: true },
      );
    }

    // 2) Migrate albums, embedding artist data where available
    console.log("Loading albums from Postgres...");
    const albumsRes = await pg.query("SELECT * FROM album");
    console.log(`Found ${albumsRes.rows.length} albums.`);

    for (const row of albumsRes.rows) {
      const artistId = row.artistid;
      const artistDoc = artistId != null ? artistsById.get(artistId) : undefined;
      const doc = Album.buildAlbumDoc(row, { artist: artistDoc });

      if (doc.albumid == null) {
        console.warn("Album row missing albumid, skipping:", row);
        continue;
      }

      await db.collection("album").updateOne(
        { albumid: doc.albumid },
        { $set: doc },
        { upsert: true },
      );
    }

    console.log("Migration completed for artist and album collections.");
  } finally {
    await pg.end().catch(() => {});
    await mongoClient.close().catch(() => {});
  }
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});

