const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://admin:4sWzqr8Cbsz68v40Y4rpqMEw9xkhcHDn@dpg-d4ugfaili9vc73d53c70-a.singapore-postgres.render.com:5432/chatbaby_db',
  ssl: { rejectUnauthorized: false }
});

const CONV_ID = '697d2f13-20dc-462b-9fe6-dbf144e60aec';

async function run() {
  await client.connect();

  console.log('='.repeat(60));
  console.log('MESSAGES SENT FROM CHATBABY (not historical sync)');
  console.log('='.repeat(60));

  // Find messages sent by Chatbaby users (have sent_by_user_id)
  console.log('\n=== OUTBOUND WITH sent_by_user_id (sent from Chatbaby UI) ===\n');
  const chatbabySent = await client.query(`
    SELECT
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE content->>'text' IS NOT NULL) as with_text,
      COUNT(*) FILTER (WHERE content->>'mediaUrl' IS NOT NULL) as with_media_url,
      COUNT(*) FILTER (WHERE content->>'text' IS NULL AND content->>'mediaUrl' IS NULL) as missing_both
    FROM messages
    WHERE conversation_id = $1
    AND direction = 'OUTBOUND'
    AND sent_by_user_id IS NOT NULL
  `, [CONV_ID]);
  const c = chatbabySent.rows[0];
  console.log('Total sent from Chatbaby UI:', c.total);
  console.log('  With text:', c.with_text);
  console.log('  With mediaUrl:', c.with_media_url);
  console.log('  Missing both (NOT renderable):', c.missing_both);

  // Sample Chatbaby-sent messages that are NOT renderable
  console.log('\n=== SAMPLE CHATBABY-SENT NOT RENDERABLE ===\n');
  const notRenderable = await client.query(`
    SELECT id, type, content, metadata, status, created_at, sent_by_user_id
    FROM messages
    WHERE conversation_id = $1
    AND direction = 'OUTBOUND'
    AND sent_by_user_id IS NOT NULL
    AND content->>'text' IS NULL
    AND content->>'mediaUrl' IS NULL
    ORDER BY created_at DESC
    LIMIT 5
  `, [CONV_ID]);

  if (notRenderable.rows.length === 0) {
    console.log('None found! All Chatbaby-sent messages are renderable.');
  } else {
    notRenderable.rows.forEach(m => {
      console.log('ID:', m.id);
      console.log('Type:', m.type);
      console.log('Status:', m.status);
      console.log('User ID:', m.sent_by_user_id);
      console.log('Content:', JSON.stringify(m.content, null, 2));
      console.log('Metadata:', JSON.stringify(m.metadata, null, 2));
      console.log('Created:', m.created_at);
      console.log('---');
    });
  }

  // Check historical vs Chatbaby-sent
  console.log('\n=== HISTORICAL vs CHATBABY-SENT BREAKDOWN ===\n');
  const breakdown = await client.query(`
    SELECT
      CASE
        WHEN sent_by_user_id IS NOT NULL THEN 'Chatbaby UI'
        WHEN metadata->>'isHistorical' = 'true' THEN 'Historical Sync'
        ELSE 'Other'
      END as source,
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE content->>'text' IS NOT NULL OR content->>'mediaUrl' IS NOT NULL) as renderable,
      COUNT(*) FILTER (WHERE content->>'text' IS NULL AND content->>'mediaUrl' IS NULL) as not_renderable
    FROM messages
    WHERE conversation_id = $1 AND direction = 'OUTBOUND'
    GROUP BY 1
    ORDER BY total DESC
  `, [CONV_ID]);
  console.log('Source | Total | Renderable | Not Renderable');
  console.log('-'.repeat(50));
  breakdown.rows.forEach(r => {
    console.log(`${r.source} | ${r.total} | ${r.renderable} | ${r.not_renderable}`);
  });

  // Sample a RENDERABLE Chatbaby-sent message to see the correct format
  console.log('\n=== SAMPLE RENDERABLE CHATBABY-SENT (correct format) ===\n');
  const renderable = await client.query(`
    SELECT id, type, content, metadata, created_at
    FROM messages
    WHERE conversation_id = $1
    AND direction = 'OUTBOUND'
    AND sent_by_user_id IS NOT NULL
    AND content->>'text' IS NOT NULL
    ORDER BY created_at DESC
    LIMIT 2
  `, [CONV_ID]);
  renderable.rows.forEach(m => {
    console.log('ID:', m.id);
    console.log('Type:', m.type);
    console.log('Content:', JSON.stringify(m.content, null, 2));
    console.log('---');
  });

  // Check if there are messages with wrong metadata (sent to @s.whatsapp.net for groups)
  console.log('\n=== CHECK FOR WRONG JID IN METADATA ===\n');
  const wrongJid = await client.query(`
    SELECT
      COUNT(*) FILTER (WHERE metadata->'key'->>'remoteJid' LIKE '%@s.whatsapp.net') as with_individual_jid,
      COUNT(*) FILTER (WHERE metadata->'key'->>'remoteJid' LIKE '%@g.us') as with_group_jid,
      COUNT(*) FILTER (WHERE metadata->'key'->>'remoteJid' IS NULL) as no_jid
    FROM messages
    WHERE conversation_id = $1
    AND direction = 'OUTBOUND'
  `, [CONV_ID]);
  const j = wrongJid.rows[0];
  console.log('With @s.whatsapp.net JID:', j.with_individual_jid);
  console.log('With @g.us JID:', j.with_group_jid);
  console.log('No JID in metadata:', j.no_jid);

  await client.end();
}

run().catch(console.error);
