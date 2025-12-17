import Image from 'next/image';
import Link from 'next/link';

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-hotpink-50 via-white to-lavender-50 dark:from-purple-950 dark:via-purple-900 dark:to-hotpink-950/50 p-4 relative overflow-hidden">
      {/* Decorative blobs */}
      <div className="absolute top-0 left-0 w-96 h-96 bg-hotpink-200/30 dark:bg-hotpink-900/20 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2" />
      <div className="absolute bottom-0 right-0 w-96 h-96 bg-purple-200/30 dark:bg-purple-900/20 rounded-full blur-3xl translate-x-1/2 translate-y-1/2" />

      <Link href="/" className="mb-8 relative z-10">
        <Image
          src="/logo.png"
          alt="ChatBaby"
          width={180}
          height={60}
          className="object-contain drop-shadow-lg"
          priority
        />
      </Link>
      <div className="w-full max-w-md relative z-10">{children}</div>
    </div>
  );
}
