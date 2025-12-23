/**
 * Script to check Cloudinary URLs in the database
 * Run with: npx ts-node scripts/check-cloudinary.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkCloudinaryUrls() {
  console.log('Checking Cloudinary URLs in database...\n');

  // Check messages with media URLs
  const messagesWithMedia = await prisma.message.findMany({
    where: {
      content: {
        path: ['mediaUrl'],
        not: null,
      },
    },
    select: {
      id: true,
      content: true,
      createdAt: true,
    },
    take: 10,
    orderBy: { createdAt: 'desc' },
  });

  console.log(`Found ${messagesWithMedia.length} recent messages with media URLs:\n`);

  for (const msg of messagesWithMedia) {
    const content = msg.content as { mediaUrl?: string; mediaType?: string };
    if (content?.mediaUrl) {
      console.log(`Message ID: ${msg.id}`);
      console.log(`Media URL: ${content.mediaUrl}`);
      console.log(`Media Type: ${content.mediaType || 'unknown'}`);
      console.log(`Created: ${msg.createdAt}`);

      // Try to fetch the URL
      try {
        const response = await fetch(content.mediaUrl, { method: 'HEAD' });
        console.log(`Status: ${response.status} ${response.statusText}`);
      } catch (error: any) {
        console.log(`Fetch Error: ${error.message}`);
      }
      console.log('---');
    }
  }

  // Check contacts with avatar URLs containing cloudinary
  const contactsWithCloudinaryAvatar = await prisma.contact.findMany({
    where: {
      avatarUrl: {
        contains: 'cloudinary',
      },
    },
    select: {
      id: true,
      displayName: true,
      avatarUrl: true,
    },
    take: 5,
  });

  console.log(`\nFound ${contactsWithCloudinaryAvatar.length} contacts with Cloudinary avatars:\n`);

  for (const contact of contactsWithCloudinaryAvatar) {
    console.log(`Contact: ${contact.displayName || contact.id}`);
    console.log(`Avatar URL: ${contact.avatarUrl}`);

    if (contact.avatarUrl) {
      try {
        const response = await fetch(contact.avatarUrl, { method: 'HEAD' });
        console.log(`Status: ${response.status} ${response.statusText}`);
      } catch (error: any) {
        console.log(`Fetch Error: ${error.message}`);
      }
    }
    console.log('---');
  }

  // Count total media URLs
  const totalMediaMessages = await prisma.message.count({
    where: {
      content: {
        path: ['mediaUrl'],
        not: null,
      },
    },
  });

  console.log(`\nTotal messages with media URLs: ${totalMediaMessages}`);

  await prisma.$disconnect();
}

checkCloudinaryUrls().catch(console.error);
