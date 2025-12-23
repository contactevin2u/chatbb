const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://admin:4sWzqr8Cbsz68v40Y4rpqMEw9xkhcHDn@dpg-d4ugfaili9vc73d53c70-a.singapore-postgres.render.com:5432/chatbaby_db',
  ssl: { rejectUnauthorized: false }
});

const CONV_ID = '697d2f13-20dc-462b-9fe6-dbf144e60aec';

async function run() {
  await client.connect();

  console.log('='.repeat(60));
  console.log('DEEP INVESTIGATION - ISSUE 1: OUTBOUND MESSAGES NOT SHOWING');
  console.log('='.repeat(60));

  // 1. Check outbound messages with empty or null content
  console.log('\n=== OUTBOUND WITH EMPTY/NULL CONTENT ===\n');
  const emptyContent = await client.query(`
    SELECT COUNT(*) as cnt
    FROM messages
    WHERE conversation_id = $1
    AND direction = 'OUTBOUND'
    AND (content IS NULL OR content::text = '{}' OR content::text = 'null')
  `, [CONV_ID]);
  console.log('Outbound with empty content:', emptyContent.rows[0].cnt);

  // 2. Check outbound TEXT messages without text field
  console.log('\n=== OUTBOUND TEXT WITHOUT text FIELD ===\n');
  const noText = await client.query(`
    SELECT COUNT(*) as cnt
    FROM messages
    WHERE conversation_id = $1
    AND direction = 'OUTBOUND'
    AND type = 'TEXT'
    AND (content->>'text' IS NULL OR content->>'text' = '')
  `, [CONV_ID]);
  console.log('TEXT type without text field:', noText.rows[0].cnt);

  // Sample these problematic messages
  const noTextSample = await client.query(`
    SELECT id, type, content, metadata, created_at
    FROM messages
    WHERE conversation_id = $1
    AND direction = 'OUTBOUND'
    AND type = 'TEXT'
    AND (content->>'text' IS NULL OR content->>'text' = '')
    ORDER BY created_at DESC
    LIMIT 5
  `, [CONV_ID]);
  if (noTextSample.rows.length > 0) {
    console.log('\nSample TEXT messages without text:');
    noTextSample.rows.forEach(m => {
      console.log('ID:', m.id);
      console.log('Content:', JSON.stringify(m.content));
      console.log('Metadata keys:', Object.keys(m.metadata || {}));
      console.log('---');
    });
  }

  // 3. Check outbound IMAGE/VIDEO/DOCUMENT without mediaUrl
  console.log('\n=== MEDIA MESSAGES WITHOUT mediaUrl ===\n');
  const noMedia = await client.query(`
    SELECT type, COUNT(*) as cnt
    FROM messages
    WHERE conversation_id = $1
    AND direction = 'OUTBOUND'
    AND type IN ('IMAGE', 'VIDEO', 'AUDIO', 'DOCUMENT')
    AND (content->>'mediaUrl' IS NULL OR content->>'mediaUrl' = '')
    GROUP BY type
  `, [CONV_ID]);
  noMedia.rows.forEach(r => console.log(r.type, 'without mediaUrl:', r.cnt));

  // 4. Check for messages with unusual content structure
  console.log('\n=== CONTENT STRUCTURE ANALYSIS ===\n');
  const contentKeys = await client.query(`
    SELECT
      jsonb_object_keys(content) as key,
      COUNT(*) as cnt
    FROM messages
    WHERE conversation_id = $1
    AND direction = 'OUTBOUND'
    AND content IS NOT NULL
    AND content::text != '{}'
    GROUP BY jsonb_object_keys(content)
    ORDER BY cnt DESC
    LIMIT 20
  `, [CONV_ID]);
  console.log('Content keys found in outbound messages:');
  contentKeys.rows.forEach(r => console.log(' ', r.key, '-', r.cnt));

  // 5. Check metadata structure
  console.log('\n=== METADATA STRUCTURE ===\n');
  const metaKeys = await client.query(`
    SELECT
      jsonb_object_keys(metadata) as key,
      COUNT(*) as cnt
    FROM messages
    WHERE conversation_id = $1
    AND direction = 'OUTBOUND'
    AND metadata IS NOT NULL
    AND metadata::text != '{}'
    GROUP BY jsonb_object_keys(metadata)
    ORDER BY cnt DESC
    LIMIT 20
  `, [CONV_ID]);
  console.log('Metadata keys found in outbound messages:');
  metaKeys.rows.forEach(r => console.log(' ', r.key, '-', r.cnt));

  // 6. Check for messages that might have been stored with raw WhatsApp format
  console.log('\n=== MESSAGES WITH RAW WHATSAPP FORMAT ===\n');
  const rawFormat = await client.query(`
    SELECT COUNT(*) as cnt
    FROM messages
    WHERE conversation_id = $1
    AND direction = 'OUTBOUND'
    AND (
      content::text LIKE '%"message":%'
      OR content::text LIKE '%extendedTextMessage%'
      OR content::text LIKE '%imageMessage%'
    )
  `, [CONV_ID]);
  console.log('Outbound with raw WhatsApp format in content:', rawFormat.rows[0].cnt);

  // Sample raw format messages
  const rawSample = await client.query(`
    SELECT id, type, content, created_at
    FROM messages
    WHERE conversation_id = $1
    AND direction = 'OUTBOUND'
    AND content::text LIKE '%"message":%'
    ORDER BY created_at DESC
    LIMIT 3
  `, [CONV_ID]);
  if (rawSample.rows.length > 0) {
    console.log('\nSample messages with raw format:');
    rawSample.rows.forEach(m => {
      console.log('ID:', m.id);
      console.log('Type:', m.type);
      console.log('Content (first 200 chars):', JSON.stringify(m.content).slice(0, 200));
      console.log('---');
    });
  }

  // 7. Compare what frontend would render vs what's in DB
  console.log('\n=== RENDERABLE vs NON-RENDERABLE OUTBOUND ===\n');
  const renderable = await client.query(`
    SELECT
      COUNT(*) FILTER (WHERE
        (type = 'TEXT' AND content->>'text' IS NOT NULL AND content->>'text' != '')
        OR (type IN ('IMAGE', 'VIDEO', 'AUDIO', 'DOCUMENT', 'STICKER') AND content->>'mediaUrl' IS NOT NULL)
      ) as renderable,
      COUNT(*) FILTER (WHERE NOT (
        (type = 'TEXT' AND content->>'text' IS NOT NULL AND content->>'text' != '')
        OR (type IN ('IMAGE', 'VIDEO', 'AUDIO', 'DOCUMENT', 'STICKER') AND content->>'mediaUrl' IS NOT NULL)
      )) as non_renderable
    FROM messages
    WHERE conversation_id = $1 AND direction = 'OUTBOUND'
  `, [CONV_ID]);
  console.log('Renderable outbound:', renderable.rows[0].renderable);
  console.log('Non-renderable outbound:', renderable.rows[0].non_renderable);

  // 8. Sample non-renderable outbound
  const nonRenderSample = await client.query(`
    SELECT id, type, content, status, created_at
    FROM messages
    WHERE conversation_id = $1
    AND direction = 'OUTBOUND'
    AND NOT (
      (type = 'TEXT' AND content->>'text' IS NOT NULL AND content->>'text' != '')
      OR (type IN ('IMAGE', 'VIDEO', 'AUDIO', 'DOCUMENT', 'STICKER') AND content->>'mediaUrl' IS NOT NULL)
    )
    ORDER BY created_at DESC
    LIMIT 10
  `, [CONV_ID]);
  if (nonRenderSample.rows.length > 0) {
    console.log('\nSample non-renderable outbound messages:');
    nonRenderSample.rows.forEach(m => {
      console.log('ID:', m.id);
      console.log('Type:', m.type);
      console.log('Status:', m.status);
      console.log('Content:', JSON.stringify(m.content));
      console.log('Created:', m.created_at);
      console.log('---');
    });
  }

  // 9. Check for INBOUND messages too (to compare)
  console.log('\n=== INBOUND COMPARISON ===\n');
  const inboundRenderable = await client.query(`
    SELECT
      COUNT(*) FILTER (WHERE
        (type = 'TEXT' AND (content->>'text' IS NOT NULL OR content::text LIKE '%extendedTextMessage%'))
        OR (type IN ('IMAGE', 'VIDEO', 'AUDIO', 'DOCUMENT', 'STICKER') AND content->>'mediaUrl' IS NOT NULL)
      ) as renderable,
      COUNT(*) FILTER (WHERE NOT (
        (type = 'TEXT' AND (content->>'text' IS NOT NULL OR content::text LIKE '%extendedTextMessage%'))
        OR (type IN ('IMAGE', 'VIDEO', 'AUDIO', 'DOCUMENT', 'STICKER') AND content->>'mediaUrl' IS NOT NULL)
      )) as non_renderable
    FROM messages
    WHERE conversation_id = $1 AND direction = 'INBOUND'
  `, [CONV_ID]);
  console.log('Renderable inbound:', inboundRenderable.rows[0].renderable);
  console.log('Non-renderable inbound:', inboundRenderable.rows[0].non_renderable);

  console.log('\n' + '='.repeat(60));
  console.log('ISSUE 2: PAGINATION - CURRENT STATE');
  console.log('='.repeat(60));

  // Total messages vs what frontend shows
  const totalMsgs = await client.query(`
    SELECT COUNT(*) as total FROM messages WHERE conversation_id = $1
  `, [CONV_ID]);
  console.log('\nTotal messages in conversation:', totalMsgs.rows[0].total);
  console.log('Frontend currently loads: 50 (no pagination)');
  console.log('Messages NOT shown on first load:', totalMsgs.rows[0].total - 50);

  await client.end();
}

run().catch(console.error);
