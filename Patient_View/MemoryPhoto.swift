import Foundation
import Supabase

// MARK: - Model
struct MemoryPhoto: Codable, Identifiable {
    let id: UUID
    let user_id: UUID?
    let person_name: String
    let location: String?
    let voice_id: String?
    let event: String?
    let image_url: String
    let created_at: Date
}

// MARK: - Supabase Client (minimal)
enum SupabaseManager {
    static let shared = SupabaseClient(
        supabaseURL: URL(string: "https://eslxkrnckjvihsyhhntz.supabase.co")!,
        supabaseKey: "<KEY>"
    )

    static func fetchMemoryPhotos(limit: Int = 200) async throws -> [MemoryPhoto] {
        try await shared.database
            .from("memories_photos")
            .select()
            .order("created_at", ascending: false)
            .limit(limit)
            .execute()
            .value
    }
}
