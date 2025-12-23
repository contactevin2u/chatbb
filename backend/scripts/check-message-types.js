const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://admin:4sWzqr8Cbsz68v40Y4rpqMEw9xkhcHDn@dpg-d4ugfaili9vc73d53c70-a.singapore-postgres.render.com:5432/chatbaby_db',
  ssl: { rejectUnauthorized: false }
});

const CONV_ID = '697d2f13-20dc-462b-9fe6-dbf144e60aec';

async function run() {
  await client.connect();

  // Check message types
  console.log('=== MESSAGE TYPES ===\n');
  const types = await client.query(`
    SELECT type, COUNT(*) as cnt
    FROM messages WHERE conversation_id = $1
    GROUP BY type ORDER BY cnt DESC
  `, [CONV_ID]);
  types.rows.forEach(r => console.log(r.type, '-', r.cnt));

  // Check for protocol messages
  console.log('\n=== SPECIAL MESSAGE TYPES IN CONTENT ===\n');
  const special = await client.query(`
    SELECT
      COUNT(*) FILTER (WHERE content::text LIKE '%albumMessage%') as album,
      COUNT(*) FILTER (WHERE content::text LIKE '%protocolMessage%') as protocol,
      COUNT(*) FILTER (WHERE content::text LIKE '%reactionMessage%') as reaction,
      COUNT(*) FILTER (WHERE content::text LIKE '%stickerMessage%') as sticker,
      COUNT(*) FILTER (WHERE content::text LIKE '%imageMessage%') as image,
      COUNT(*) FILTER (WHERE content::text LIKE '%videoMessage%') as video,
      COUNT(*) FILTER (WHERE content::text LIKE '%audioMessage%') as audio,
      COUNT(*) FILTER (WHERE content::text LIKE '%documentMessage%') as document,
      COUNT(*) FILTER (WHERE content::text LIKE '%extendedTextMessage%') as extended_text
    FROM messages WHERE conversation_id = $1
  `, [CONV_ID]);
  const s = special.rows[0];
  console.log('Album messages:', s.album);
  console.log('Protocol messages:', s.protocol);
  console.log('Reaction messages:', s.reaction);
  console.log('Sticker messages:', s.sticker);
  console.log('Image messages:', s.image);
  console.log('Video messages:', s.video);
  console.log('Audio messages:', s.audio);
  console.log('Document messages:', s.document);
  console.log('Extended text:', s.extended_text);

  // Sample protocol messages - these often don't render
  console.log('\n=== SAMPLE PROTOCOL MESSAGES ===\n');
  const proto = await client.query(`
    SELECT id, content, type, created_at FROM messages
    WHERE conversation_id = $1
    AND content::text LIKE '%protocolMessage%'
    ORDER BY created_at DESC
    LIMIT 3
  `, [CONV_ID]);
  proto.rows.forEach(m => {
    console.log('ID:', m.id, '| Type:', m.type);
    const protoType = m.content?.message?.protocolMessage?.type;
    console.log('Protocol Type:', protoType);
    console.log('---');
  });

  // Check messages without text field but have content
  console.log('\n=== MESSAGES WITH CONTENT BUT NO TEXT ===\n');
  const noText = await client.query(`
    SELECT id, type, content, created_at FROM messages
    WHERE conversation_id = $1
    AND content IS NOT NULL
    AND content::text != '{}'
    AND content->>'text' IS NULL
    AND type = 'TEXT'
    ORDER BY created_at DESC
    LIMIT 5
  `, [CONV_ID]);
  console.log('TEXT type messages without text field:', noText.rows.length);
  noText.rows.forEach(m => {
    console.log('ID:', m.id);
    console.log('Content keys:', Object.keys(m.content || {}));
    if (m.content?.message) {
      console.log('Message keys:', Object.keys(m.content.message));
    }
    console.log('---');
  });

  // Check for messages that might show as gaps (no renderable content)
  console.log('\n=== POTENTIALLY NON-RENDERABLE MESSAGES ===\n');
  const nonRenderable = await client.query(`
    SELECT COUNT(*) as cnt FROM messages
    WHERE conversation_id = $1
    AND (
      content::text LIKE '%protocolMessage%'
      OR content::text LIKE '%reactionMessage%'
      OR (type = 'TEXT' AND content->>'text' IS NULL AND content::text NOT LIKE '%extendedTextMessage%')
    )
  `, [CONV_ID]);
  console.log('Non-renderable messages:', nonRenderable.rows[0].cnt);

  await client.end();
}

run().catch(console.error);
