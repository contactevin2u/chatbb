import Image from 'next/image';
import Link from 'next/link';

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-muted/30 p-4">
      <Link href="/" className="mb-8">
        <Image
          src="/logo.png"
          alt="ChatBaby"
          width={180}
          height={60}
          className="object-contain"
          priority
        />
      </Link>
      <div className="w-full max-w-md">{children}</div>
    </div>
  );
}
