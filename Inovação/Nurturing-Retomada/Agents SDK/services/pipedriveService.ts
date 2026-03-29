import { PIPEDRIVE_API_BASE_URL, PIPEDRIVE_API_TOKEN, CUSTOM_FIELDS } from '../config';

export const PipedriveRepository = {
    fetchDealsInStages: async function (stageIds: number[]) {
        let allDeals: any[] = [];
        for (const id of stageIds) {
            const url = `${PIPEDRIVE_API_BASE_URL}/deals?stage_id=${id}&status=open&api_token=${PIPEDRIVE_API_TOKEN}`;
            const resp = await fetch(url);
            const data = await resp.json();
            if (data.success && data.data) allDeals = allDeals.concat(data.data);
        }
        return allDeals;
    },

    getNotesFromDeal: async function (dealId: number) {
        const url = `${PIPEDRIVE_API_BASE_URL}/notes?deal_id=${dealId}&api_token=${PIPEDRIVE_API_TOKEN}`;
        const resp = await fetch(url);
        const data = await resp.json();
        return data.data || [];
    },

    getActiveUsers: async function () {
        const url = `${PIPEDRIVE_API_BASE_URL}/users?api_token=${PIPEDRIVE_API_TOKEN}`;
        const resp = await fetch(url);
        const result = await resp.json();
        const users = result.data || [];
        return users.filter((u: any) => u.active_flag).map((u: any) => u.id);
    },

    fetchEmailHistory: async function (dealId: number) {
        const url = `${PIPEDRIVE_API_BASE_URL}/deals/${dealId}/mailMessages?api_token=${PIPEDRIVE_API_TOKEN}`;
        const resp = await fetch(url);
        if (!resp.ok) return [];
        const result = await resp.json();
        const data = result.data;
        if (!data) return [];

        return data.slice(0, 5).map((msg: any) => ({
            origem: msg.from?.[0]?.email?.includes("polijunior") ? "Poli Júnior" : "Cliente",
            data: msg.add_time,
            preview: msg.snippet?.substring(0, 200).replace(/<[^>]*>?/gm, '') || ""
        }));
    },

    createNote: async function (dealId: number, content: string) {
        const url = `${PIPEDRIVE_API_BASE_URL}/notes?api_token=${PIPEDRIVE_API_TOKEN}`;
        const payload = { deal_id: dealId, content: content };
        await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
    },

    syncOriginNotes: async function (dealId: number, originalDealId: number) {
        if (!originalDealId) return [];
        const originalNotes = await this.getNotesFromDeal(originalDealId);

        if (originalNotes && originalNotes.length > 0) {
            for (const note of originalNotes) {
                const cleanedContent = (note.content || "").replace(/<[^>]*>?/gm, ' ');
                await this.createNote(dealId, cleanedContent);
                // Evita sobrecarga de API
                await new Promise(r => setTimeout(r, 300));
            }
        }
        return originalNotes;
    },

    saveEmailToDeal: async function (dealId: number, title: string, body: string) {
        const url = `${PIPEDRIVE_API_BASE_URL}/deals/${dealId}?api_token=${PIPEDRIVE_API_TOKEN}`;
        const payload = {
            [CUSTOM_FIELDS.EMAIL_TITLE]: title,
            [CUSTOM_FIELDS.EMAIL_BODY]: body
        };
        await fetch(url, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
    },

    markDealAsLost: async function (dealId: number, reason: string) {
        const url = `${PIPEDRIVE_API_BASE_URL}/deals/${dealId}?api_token=${PIPEDRIVE_API_TOKEN}`;
        const payload = { status: 'lost', lost_reason: reason };
        await fetch(url, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
    }
};