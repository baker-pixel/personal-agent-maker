import AppMenu from "@/components/AppMenu";

export default function AppHeader() {
  return (
    <header className="fixed top-0 right-0 z-[60] p-3 pt-[calc(env(safe-area-inset-top)+12px)]">
      <AppMenu />
    </header>
  );
}
