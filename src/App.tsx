import { ColorEditor } from './components/ColorEditor';

function App() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          Tailwind color finder
        </h1>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
          Paste or type CSS colors — hex, rgb, hsl, oklch, or oklab — and hover
          any one to see its five nearest Tailwind colors.
        </p>
      </header>
      <div className="overflow-hidden rounded-lg border border-gray-300 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900">
        <ColorEditor />
      </div>
    </main>
  );
}

export default App;
