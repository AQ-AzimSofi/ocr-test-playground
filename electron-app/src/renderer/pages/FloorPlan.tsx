export default function FloorPlan() {
  return (
    <div className="px-4 py-6 sm:px-0">
      <div className="bg-white shadow sm:rounded-lg p-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">Floor Plan to Revit Conversion</h2>
        <p className="text-gray-600 mb-4">
          Upload a floor plan image and convert it to Revit-compatible JSON with auto-generated Dynamo Python script.
        </p>
        <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4">
          <p className="text-sm text-yellow-700">
            Coming soon in Phase 4! This feature will allow you to:
          </p>
          <ul className="mt-2 text-sm text-yellow-700 list-disc list-inside space-y-1">
            <li>Upload floor plan images (PNG/JPG)</li>
            <li>Run Hybrid CV+AI wall/room detection (~0.50-1.00 yen per plan)</li>
            <li>Download Revit JSON with dual coordinates (pixels + millimeters)</li>
            <li>Get auto-generated Dynamo Python script (ready to copy-paste)</li>
            <li>Preview detected walls, rooms, doors, and windows</li>
            <li>View usage instructions for importing into Revit</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
