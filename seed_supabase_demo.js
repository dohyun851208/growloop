/**
 * Seed demo data for 2026-03-01
 * - Tables: objectives, tasks, rating_criteria, reviews
 * - Uses upsert so you can safely re-run.
 *
 * Usage:
 *   1) npm i @supabase/supabase-js
 *   2) export SUPABASE_URL="https://YOUR_PROJECT.supabase.co"
 *      export SUPABASE_SERVICE_ROLE_KEY="YOUR_SERVICE_ROLE_KEY"   // ⚠️ 서버/로컬에서만 사용 권장
 *   3) node seed_supabase_demo.js
 */
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

// app.js에서 가져온 Supabase 설정
const SUPABASE_URL = 'https://ftvalqzaiooebkulafzg.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ0dmFscXphaW9vZWJrdWxhZnpnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzNzk1MzAsImV4cCI6MjA4NTk1NTUzMH0.M1qXvUIuNe2y-9y1gQ2svRdHvDKrMRQ4oMGZPIZveQs';

const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
});

const seed = JSON.parse(
  fs.readFileSync(new URL("./seed_2026-03-01_peer_reviews.json", import.meta.url), "utf-8")
);

async function upsertAll() {
  // 1) objectives
  await db.from("objectives").upsert(seed.objectives, { onConflict: "class_code,eval_date" });

  // 2) tasks
  await db.from("tasks").upsert(seed.tasks, { onConflict: "class_code,eval_date" });

  // 3) rating_criteria
  await db
    .from("rating_criteria")
    .upsert(seed.rating_criteria, { onConflict: "class_code,eval_date,eval_type" });

  // 4) reviews (대량이므로 500개 단위로 쪼개서 upsert)
  const batchSize = 500;
  for (let i = 0; i < seed.reviews.length; i += batchSize) {
    const batch = seed.reviews.slice(i, i + batchSize);

    const { error } = await db.from("reviews").upsert(batch, {
      onConflict: "class_code,review_date,reviewer_id,target_id,review_type",
    });

    if (error) throw error;
    console.log(`reviews upserted: ${i} ~ ${i + batch.length - 1}`);
  }
}

upsertAll()
  .then(() => {
    console.log("✅ Seed complete:", seed.meta);
    process.exit(0);
  })
  .catch((err) => {
    console.error("❌ Seed failed:", err);
    process.exit(1);
  });
