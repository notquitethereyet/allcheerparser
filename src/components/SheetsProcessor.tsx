import { useState, useContext, useEffect } from "react";
import { AuthContext } from "../App";

import { processClientData } from "../processors/clientProcessor";
import { processStaffData } from "../processors/staffProcessor";
import { processAddressData } from "../processors/addressProcessor";
import { fetchFolders, clearCache } from "../utils/googleDriveUtils";
import FolderSelector from "../components/FolderSelector";
import Processor from "../components/Processor";

const PARENT_FOLDER_ID = "10CSN3c8UjyNzt7haNVlBkQthVPxzFTAf";

const SheetsProcessor = () => {
  const auth = useContext(AuthContext);
  const [folders, setFolders] = useState([]);
  const [selectedFolders, setSelectedFolders] = useState({
    clients: "",
    therapists: "",
    supervisors: "",
  });
  const [isLoadingFolders, setIsLoadingFolders] = useState(true);
  const [folderError, setFolderError] = useState("");

  // Fetch folders from the Google Drive API
  useEffect(() => {
    const loadFolders = async () => {
      if (!auth?.accessToken) return;

      try {
        const folderList = await fetchFolders(auth.accessToken, PARENT_FOLDER_ID);
        setFolders(folderList);
      } catch (error) {
        setFolderError(
          "Error loading folders: " +
            (error instanceof Error ? error.message : String(error))
        );
      } finally {
        setIsLoadingFolders(false);
      }
    };

    loadFolders();
  }, [auth?.accessToken]);

  if (isLoadingFolders) {
    return (
      <div className="min-h-screen bg-background p-6 flex items-center justify-center">
        <div className="text-xl">Loading folders...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-6 md:p-8">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-lg shadow-lg p-6">
          <h1 className="text-3xl font-bold text-primary text-center mb-6">
            Schedule Data Processor
          </h1>

          {/* Display folder loading error */}
          {folderError && (
            <div className="mb-6 p-4 bg-red-100 text-red-700 rounded-lg">
              {folderError}
            </div>
          )}

          {/* Folder Selection Section */}
          <div className="mb-8">
            <h2 className="text-xl font-semibold mb-4">Folder Selection</h2>
            <div className="space-y-4">
              <FolderSelector
                folders={folders}
                selectedFolder={selectedFolders.clients}
                onSelect={(id) =>
                  setSelectedFolders((prev) => ({ ...prev, clients: id }))
                }
                label="Select Clients Folder"
                disabled={isLoadingFolders}
              />
              <FolderSelector
                folders={folders}
                selectedFolder={selectedFolders.therapists}
                onSelect={(id) =>
                  setSelectedFolders((prev) => ({ ...prev, therapists: id }))
                }
                label="Select Therapists Folder"
                disabled={isLoadingFolders}
              />
              <FolderSelector
                folders={folders}
                selectedFolder={selectedFolders.supervisors}
                onSelect={(id) =>
                  setSelectedFolders((prev) => ({ ...prev, supervisors: id }))
                }
                label="Select Supervisors Folder"
                disabled={isLoadingFolders}
              />
            </div>
          </div>

          {/* Processor Sections */}
          <div className="space-y-8">
            <Processor
              title="Clients"
              processFunction={processClientData}
              selectedFolder={
                selectedFolders.clients
                  ? { clients: selectedFolders.clients, therapists: "", supervisors: "" }
                  : null
              }
              disabled={isLoadingFolders || !selectedFolders.clients}
            />
            <Processor
              title="Staff"
              processFunction={processStaffData}
              selectedFolder={
                selectedFolders.therapists || selectedFolders.supervisors
                  ? {
                      clients: "",
                      therapists: selectedFolders.therapists,
                      supervisors: selectedFolders.supervisors,
                    }
                  : null
              }
              disabled={
                isLoadingFolders ||
                (!selectedFolders.therapists && !selectedFolders.supervisors)
              }
            />
            <Processor
              title="Addresses"
              processFunction={processAddressData}
              selectedFolder={
                selectedFolders.clients ||
                selectedFolders.therapists ||
                selectedFolders.supervisors
                  ? selectedFolders
                  : null
              }
              disabled={
                isLoadingFolders ||
                (!selectedFolders.clients &&
                  !selectedFolders.therapists &&
                  !selectedFolders.supervisors)
              }
            />

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
                Clear the cache if you want to fetch fresh data from Google
                Drive.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SheetsProcessor;
