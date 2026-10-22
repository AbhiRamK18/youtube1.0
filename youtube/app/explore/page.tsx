import CategoryTabs from "@/components/category-tabs";
import Videosgrid from "@/components/Videosgrid";

export default function ExplorePage() {
  return (
    <main className="flex-1 p-4">
      <h1 className="mb-4 text-2xl font-bold">Explore</h1>
      <CategoryTabs />
      <Videosgrid />
    </main>
  );
}
