import { fetchFileData } from "../utils/googleDriveUtils";



export   const processAddressData = async (authToken: string, selectedFolders: { clients: string; therapists: string; supervisors: string }) => {
    if (!selectedFolders.clients && !selectedFolders.therapists && !selectedFolders.supervisors) {
      throw new Error('No folders selected for address processing');
    }

    // const addressData: AddressData[] = [];
    const addressData: { Initials: string; Type: "Client" | "Staff"; Address: string }[] = [];

    const processFolder = async (folderId: string, type: 'Client' | 'Staff') => {
      if (!folderId) {
        console.warn(`Skipping address processing: No folder ID provided for ${type}`);
        return;
      }

      const response = await fetch(
        `https://www.googleapis.com/drive/v3/files?q='${folderId}' in parents&pageSize=100`,
        { headers: { Authorization: `Bearer ${authToken}` } }
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch files from ${type} folder: ${response.statusText}`);
      }

      const { files } = await response.json();
      for (const file of files) {
        try {
          const data = await fetchFileData(authToken, file);

          // Locate rows containing initials and addresses
          const initialsRowIndex = data.findIndex((row: any[]) =>
            row[0]?.toLowerCase()?.includes("initial")
          );
          const initials =
            initialsRowIndex !== -1
              ? data[initialsRowIndex][1]?.trim() || "Unknown"
              : file.name.match(/_(\w+)\./)?.[1] || "Unknown";

          // Find all address rows
          const addressRows = data.filter((row: any[]) =>
            row[0]?.toLowerCase()?.includes("address")
          );

          addressRows.forEach((row: any[]) => {
            const isSchoolAddress = row[0]?.toLowerCase()?.includes("school");
            const address = row[1]?.trim();

            if (address) {
              // For clients, include suffix (H or S)
              if (type === "Client") {
                const addressType = isSchoolAddress ? "S" : "H";
                addressData.push({
                  Initials: `${initials}${addressType}`,
                  Type: type,
                  Address: address,
                });
              }

              // For staff, include address without suffix and only home address
              if (type === "Staff" && !isSchoolAddress) {
                addressData.push({
                  Initials: initials,
                  Type: type,
                  Address: address,
                });
              }
            }
          });

        } catch (error) {
          console.error(`Error processing address file (${file.name}):`, error);
        }
      }
    };

    // Process all selected folders
    const folderProcessingPromises = [];

    if (selectedFolders.clients) {
      folderProcessingPromises.push(processFolder(selectedFolders.clients, "Client"));
    }

    if (selectedFolders.therapists) {
      folderProcessingPromises.push(processFolder(selectedFolders.therapists, "Staff"));
    }

    if (selectedFolders.supervisors) {
      folderProcessingPromises.push(processFolder(selectedFolders.supervisors, "Staff"));
    }

    // Wait for all folder processing to complete
    await Promise.all(folderProcessingPromises);

    // Sort the address data by Type (Clients first, then Staff) and then by Initials
    return addressData.sort((a, b) => {
      if (a.Type === b.Type) {
        return a.Initials.localeCompare(b.Initials);
      }
      return a.Type === "Client" ? -1 : 1;
    });
  };