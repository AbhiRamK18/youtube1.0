import Link from "next/link";

export default function SubscriptionsPage() {
  return (
    <main className="flex-1 p-6">
      <h1 className="mb-4 text-2xl font-bold">Subscriptions</h1>
      <p className="text-gray-600">
        Videos from channels you subscribe to will appear here.
      </p>
      <Link className="mt-4 inline-block text-blue-600 hover:underline" href="/explore">
        Explore videos
      </Link>
    </main>
  );
}
