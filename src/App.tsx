import { ColorEditor } from './components/ColorEditor';

function App() {
  return (
    <div className="m-8 mx-auto max-w-3xl">
      <h1 className="mb-4 text-2xl font-bold">Color explorer</h1>
      <div className="overflow-hidden rounded-lg border border-gray-300 dark:border-gray-700">
        <ColorEditor />
      </div>
    </div>
  );
}

export default App;
