import { useState, useContext } from "react";
import { AuthContext } from "../App";
import { processClientData } from "../processors/clientProcessor";
import { processStaffData } from "../processors/staffProcessor";
import { processAddressData } from "../processors/addressProcessor";
import { fetchFolders, clearCache } from "../utils/googleDriveUtils";
import FolderSelector from "../components/FolderSelector";
import Processor from "../components/Processor";

const SheetsProcessor = () => {
  const auth = useContext(AuthContext);
  const [shareLink, setShareLink] = useState("");
  const [folders, setFolders] = useState([]);
  const [selectedFolders, setSelectedFolders] = useState({
    clients: "",
    therapists: "",
    supervisors: "",
  });
  const [isLoadingFolders, setIsLoadingFolders] = useState(false);
  const [error, setError] = useState("");

  const extractFolderId = (link: string) => {
    const match = link.match(/[-\w]{25,}/);
    return match ? String(match[0]) : null;
  };

  const handleFetchFolders = async () => {
    if (!auth?.accessToken) {
      setError("You must be logged in to fetch folders.");
      return;
    }

    const folderId = extractFolderId(shareLink);
    if (!folderId) {
      setError("Invalid Google Drive share link. Please check the link and try again.");
      return;
    }

    setIsLoadingFolders(true);
    setError("");

    try {
      const folderList = await fetchFolders(auth.accessToken, folderId);
      setFolders(folderList);
    } catch (err) {
      setError(
        `Failed to fetch folders. ${err instanceof Error ? err.message : String(err)}`
      );
    } finally {
      setIsLoadingFolders(false);
    }
  };

  return (
    <div className="min-h-screen bg-background p-6 md:p-8">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-lg shadow-lg p-6">
          <h1 className="text-3xl font-bold text-primary text-center mb-6">
            Schedule Data Processor
          </h1>

          {/* Google Drive Folder Input */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Google Drive Folder Share Link
            </label>
            <input
              type="text"
              value={shareLink}
              onChange={(e) => setShareLink(e.target.value)}
              placeholder="Paste your Google Drive folder share link here"
              className="w-full p-2 border rounded-md"
            />
            <button
              onClick={handleFetchFolders}
              disabled={isLoadingFolders}
              className={`mt-4 px-6 py-2 rounded-lg text-white ${
                isLoadingFolders
                  ? "bg-gray-400 cursor-not-allowed"
                  : "bg-primary hover:bg-highlight-primary"
              }`}
            >
              {isLoadingFolders ? "Fetching..." : "Fetch Folders"}
            </button>
          </div>

          {/* Error Message */}
          {error && (
            <div className="mb-6 p-4 bg-red-100 text-red-700 rounded-lg">{error}</div>
          )}

          {/* Folder Selection */}
          {folders.length > 0 && (
            <div className="mb-8">
              <h2 className="text-xl font-semibold mb-4">Folder Selection</h2>
              <FolderSelector
                folders={folders}
                selectedFolder={selectedFolders.clients}
                onSelect={(id) => setSelectedFolders((prev) => ({ ...prev, clients: id }))}
                label="Select Clients Folder"
                disabled={isLoadingFolders}
              />
              <FolderSelector
                folders={folders}
                selectedFolder={selectedFolders.therapists}
                onSelect={(id) => setSelectedFolders((prev) => ({ ...prev, therapists: id }))}
                label="Select Therapists Folder"
                disabled={isLoadingFolders}
              />
              <FolderSelector
                folders={folders}
                selectedFolder={selectedFolders.supervisors}
                onSelect={(id) => setSelectedFolders((prev) => ({ ...prev, supervisors: id }))}
                label="Select Supervisors Folder"
                disabled={isLoadingFolders}
              />
            </div>
          )}

          {/* Processors */}
          {folders.length > 0 && (
            <div className="space-y-8">
              <Processor
                title="Clients"
                processFunction={(authToken, folder, onProgress = () => {}) =>
                  processClientData(authToken, folder, onProgress)
                }
                selectedFolder={selectedFolders.clients ? { clients: selectedFolders.clients } : {}}
                disabled={isLoadingFolders || !selectedFolders.clients}
              />
              <Processor
                title="Staff"
                processFunction={(authToken, folder, onProgress = () => {}) =>
                  processStaffData(authToken, folder, onProgress)
                }
                selectedFolder={
                  selectedFolders.therapists || selectedFolders.supervisors
                    ? {
                        therapists: selectedFolders.therapists || "",
                        supervisors: selectedFolders.supervisors || "",
                      }
                    : {}
                }
                disabled={isLoadingFolders || (!selectedFolders.therapists && !selectedFolders.supervisors)}
              />
              <Processor
                title="Addresses"
                processFunction={(authToken, folder, onProgress = () => {}) =>
                  processAddressData(authToken, folder, onProgress)
                }
                selectedFolder={
                  selectedFolders.clients || selectedFolders.therapists || selectedFolders.supervisors
                    ? {
                        clients: selectedFolders.clients || "",
                        therapists: selectedFolders.therapists || "",
                        supervisors: selectedFolders.supervisors || "",
                      }
                    : {}
                }
                disabled={
                  isLoadingFolders ||
                  (!selectedFolders.clients &&
                    !selectedFolders.therapists &&
                    !selectedFolders.supervisors)
                }
              />
            </div>
          )}

          {/* Cache Management */}
          <div className="mt-8 pt-8 border-t">
            <h2 className="text-xl font-semibold mb-4">Cache Management</h2>
            <button
              onClick={() => {
                clearCache();
                alert("Cache cleared successfully!");
              }}
              className="bg-red-500 text-white px-6 py-3 rounded-lg hover:bg-red-600 transition-colors"
            >
              Clear Cache
            </button>
            <p className="mt-2 text-sm text-gray-600">
              Clear the cache if you want to fetch fresh data from Google Drive.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SheetsProcessor;
