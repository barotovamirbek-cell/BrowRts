const TITLE_ID = import.meta.env.VITE_PLAYFAB_TITLE_ID ?? "";

function getStoredCustomId() {
  const key = "ironfront.playfab.customId";
  let value = localStorage.getItem(key);
  if (!value) {
    value = `if_${crypto.randomUUID()}`;
    localStorage.setItem(key, value);
  }
  return value;
}

export async function loginWithCustomId(displayName) {
  if (!TITLE_ID) {
    return {
      enabled: false,
      displayName,
      customId: getStoredCustomId(),
      playFabId: null,
      sessionTicket: null
    };
  }

  const customId = getStoredCustomId();
  const response = await fetch(`https://${TITLE_ID}.playfabapi.com/Client/LoginWithCustomID`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      TitleId: TITLE_ID,
      CustomId: customId,
      CreateAccount: true,
      InfoRequestParameters: {
        GetPlayerProfile: true
      }
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error || "PlayFab login failed");
  }

  const data = await response.json();
  const result = data.data;
  return {
    enabled: true,
    displayName: result.InfoResultPayload?.PlayerProfile?.DisplayName || displayName,
    customId,
    playFabId: result.PlayFabId,
    sessionTicket: result.SessionTicket
  };
}

async function callClientApi(path, sessionTicket, body) {
  const response = await fetch(`https://${TITLE_ID}.playfabapi.com/Client/${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Authorization": sessionTicket
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error || `${path} failed`);
  }

  const data = await response.json();
  return data.data;
}

export async function updateUserTitleDisplayName(sessionTicket, displayName) {
  if (!TITLE_ID) {
    return { DisplayName: displayName };
  }

  return callClientApi("UpdateUserTitleDisplayName", sessionTicket, {
    DisplayName: displayName
  });
}
