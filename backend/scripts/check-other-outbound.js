const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://admin:4sWzqr8Cbsz68v40Y4rpqMEw9xkhcHDn@dpg-d4ugfaili9vc73d53c70-a.singapore-postgres.render.com:5432/chatbaby_db',
  ssl: { rejectUnauthorized: false }
});

const CONV_ID = '697d2f13-20dc-462b-9fe6-dbf144e60aec';

async function run() {
  await client.connect();

  console.log('='.repeat(60));
  console.log('"OTHER" OUTBOUND MESSAGES (not historical, no user_id)');
  console.log('='.repeat(60));

  // Sample "Other" outbound messages
  console.log('\n=== SAMPLE "OTHER" OUTBOUND ===\n');
  const other = await client.query(`
    SELECT id, type, content, metadata, status, created_at
    FROM messages
    WHERE conversation_id = $1
    AND direction = 'OUTBOUND'
    AND sent_by_user_id IS NULL
    AND (metadata->>'isHistorical' IS NULL OR metadata->>'isHistorical' = 'false')
    ORDER BY created_at DESC
    LIMIT 5
  `, [CONV_ID]);

  other.rows.forEach(m => {
    console.log('ID:', m.id);
    console.log('Type:', m.type);
    console.log('Status:', m.status);
    console.log('Content keys:', Object.keys(m.content || {}));
    console.log('Text preview:', (m.content?.text || '').slice(0, 80));
    console.log('Metadata:', JSON.stringify(m.metadata, null, 2));
    console.log('Created:', m.created_at);
    console.log('---');
  });

  // Check when these were created
  console.log('\n=== DATE RANGE OF "OTHER" MESSAGES ===\n');
  const dateRange = await client.query(`
    SELECT
      MIN(created_at) as earliest,
      MAX(created_at) as latest,
      COUNT(*) as total
    FROM messages
    WHERE conversation_id = $1
    AND direction = 'OUTBOUND'
    AND sent_by_user_id IS NULL
    AND (metadata->>'isHistorical' IS NULL OR metadata->>'isHistorical' = 'false')
  `, [CONV_ID]);
  console.log('Earliest:', dateRange.rows[0].earliest);
  console.log('Latest:', dateRange.rows[0].latest);
  console.log('Total:', dateRange.rows[0].total);

  // Check metadata patterns in "Other"
  console.log('\n=== METADATA PATTERNS IN "OTHER" ===\n');
  const metaPatterns = await client.query(`
    SELECT
      metadata->>'fromMe' as from_me,
      metadata->>'pushName' as push_name,
      metadata->'key'->>'remoteJid' as remote_jid,
      COUNT(*) as cnt
    FROM messages
    WHERE conversation_id = $1
    AND direction = 'OUTBOUND'
    AND sent_by_user_id IS NULL
    AND (metadata->>'isHistorical' IS NULL OR metadata->>'isHistorical' = 'false')
    GROUP BY 1, 2, 3
    ORDER BY cnt DESC
    LIMIT 10
  `, [CONV_ID]);
  console.log('fromMe | pushName | remoteJid | Count');
  metaPatterns.rows.forEach(r => {
    console.log(`${r.from_me} | ${r.push_name?.slice(0, 15)} | ${r.remote_jid?.slice(0, 30)} | ${r.cnt}`);
  });

  // The key question: are these messages from WhatsApp that WE sent (fromMe=true)?
  console.log('\n=== ARE THESE OUR MESSAGES FROM WHATSAPP? ===\n');
  const fromMeCheck = await client.query(`
    SELECT
      COUNT(*) FILTER (WHERE metadata->>'fromMe' = 'true') as from_me_true,
      COUNT(*) FILTER (WHERE metadata->>'fromMe' = 'false') as from_me_false,
      COUNT(*) FILTER (WHERE metadata->>'fromMe' IS NULL) as from_me_null
    FROM messages
    WHERE conversation_id = $1
    AND direction = 'OUTBOUND'
    AND sent_by_user_id IS NULL
    AND (metadata->>'isHistorical' IS NULL OR metadata->>'isHistorical' = 'false')
  `, [CONV_ID]);
  const f = fromMeCheck.rows[0];
  console.log('fromMe=true:', f.from_me_true, '(sent from our WhatsApp, not via Chatbaby)');
  console.log('fromMe=false:', f.from_me_false);
  console.log('fromMe=null:', f.from_me_null);

  await client.end();
}

run().catch(console.error);
