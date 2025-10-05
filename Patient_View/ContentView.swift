
import SwiftUI
import QuickLook
import Foundation
import AVFoundation

private let ELEVENLABS_API_KEY = "<KEY>"
private let DEFAULT_VOICE_ID: String? = nil


struct MemoryItem: Identifiable, Hashable {
    let id: UUID
    let personName: String
    let location: String
    let event: String
    let imageURL: String
    let voiceID: String?
}

enum QuestionType: CaseIterable {
    case person
    case location
    case event
    
    var prompt: String {
        switch self {
        case .person:   return "Who is in this photo?"
        case .location: return "Where was this photo taken?"
        case .event:    return "What was happening in this photo?"
        }
    }
    
    func spokenPrompt(for item: MemoryItem) -> String {
        switch self {
        case .person:
            return "Do you remember who is in this picture?"
        case .location:
            return "Do you remember where this picture was taken?"
        case .event:
            return "Do you remember what was happening in this picture?"
        }
    }
}


enum TTSManager {
    struct TTSError: Error { let message: String }
    
    static func fetchSpeechData(apiKey: String, voiceID: String, text: String) async throws -> Data {
        guard let url = URL(string: "https://api.elevenlabs.io/v1/text-to-speech/\(voiceID)") else {
            throw TTSError(message: "Invalid TTS URL")
        }
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue(apiKey, forHTTPHeaderField: "xi-api-key")
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue("audio/mpeg", forHTTPHeaderField: "Accept")
        
        let payload: [String: Any] = [
            "text": text,
            "model_id": "eleven_multilingual_v2"
        ]
        req.httpBody = try JSONSerialization.data(withJSONObject: payload, options: [])
        
        let (data, resp) = try await URLSession.shared.data(for: req)
        guard let http = resp as? HTTPURLResponse, (200...299).contains(http.statusCode) else {
            let code = (resp as? HTTPURLResponse)?.statusCode ?? -1
            throw TTSError(message: "TTS failed with HTTP \(code)")
        }
        return data
    }
}


@MainActor
final class QuizViewModel: ObservableObject {
    @Published var items: [MemoryItem] = []
    
    @Published var currentIndex: Int = 0
    @Published var score: Int = 0
    @Published var hasAnswered: Bool = false
    @Published var selectedOption: String? = nil
    @Published var isCorrect: Bool = false
    @Published var showResults: Bool = false
    
    @Published var questionType: QuestionType = .person
    @Published var options: [String] = [] // exactly 3 (1 correct + 2 decoys)
    
    @Published var isDownloadingImage: Bool = false
    @Published var downloadError: String? = nil
    
    private var localFileCache: [String: URL] = [:]
    
    var totalQuestions: Int { items.count }
    var hasData: Bool { !items.isEmpty }
    
    func currentItem() -> MemoryItem { items[currentIndex] }
    func questionText() -> String { questionType.prompt }
    
    var correctAnswer: String {
        switch questionType {
        case .person:   return currentItem().personName
        case .location: return currentItem().location
        case .event:    return currentItem().event
        }
    }
    
    
    func loadMemoriesFromSupabase() async {
        do {
            let photos = try await SupabaseManager.fetchMemoryPhotos(limit: 200)
            
            var mapped: [MemoryItem] = []
            mapped.reserveCapacity(photos.count)
            
            for p in photos {
                let name = p.person_name.trimmingCharacters(in: .whitespacesAndNewlines)
                let loc  = (p.location ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
                let evt  = (p.event ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
                let url  = p.image_url.trimmingCharacters(in: .whitespacesAndNewlines)
                let voice = p.voice_id?.trimmingCharacters(in: .whitespacesAndNewlines)
                guard !url.isEmpty else { continue }
                
                mapped.append(
                    MemoryItem(
                        id: p.id,
                        personName: name.isEmpty ? "Unknown" : name,
                        location:   loc.isEmpty  ? "Unknown" : loc,
                        event:      evt.isEmpty  ? "Unknown" : evt,
                        imageURL:   url,
                        voiceID:    voice?.isEmpty == true ? nil : voice
                    )
                )
            }
            guard !mapped.isEmpty else { return }
            
            let shuffled = mapped.shuffled()
            let chosen = Array(shuffled.prefix(7))
            
            items = chosen
            resetQuizState()
            regenerateQuestionAndOptions()
        } catch {
            print("❌ Supabase fetch failed:", error)
        }
    }
    
    private func resetQuizState() {
        currentIndex = 0
        score = 0
        hasAnswered = false
        selectedOption = nil
        isCorrect = false
        showResults = false
    }
    
    
    func regenerateQuestionAndOptions() {
        guard hasData else { return }
        questionType = QuestionType.allCases.randomElement() ?? .person
        options = buildOptions(for: questionType, current: currentItem(), from: items)
    }
    
    private func buildOptions(for type: QuestionType, current: MemoryItem, from all: [MemoryItem]) -> [String] {
        let correct: String
        let pool: [String]
        switch type {
        case .person:
            correct = current.personName
            pool = all.filter { $0.id != current.id }.map { $0.personName }
        case .location:
            correct = current.location
            pool = all.filter { $0.id != current.id }.map { $0.location }
        case .event:
            correct = current.event
            pool = all.filter { $0.id != current.id }.map { $0.event }
        }
        let uniquePool = Array(Set(pool)).filter { !$0.isEmpty && $0 != correct }
        
        var decoys = Array(uniquePool.shuffled().prefix(2))
        let fallback = ["Unknown", "Not sure", "I don’t remember"]
        while decoys.count < 2 {
            if let extra = fallback.randomElement(), !decoys.contains(extra), extra != correct {
                decoys.append(extra)
            } else { break }
        }
        
        let options = ([correct] + decoys).shuffled()
        if options.count >= 3 { return Array(options.prefix(3)) }
        return options + Array(repeating: "Unknown", count: 3 - options.count)
    }
    
    
    func select(option: String) {
        guard !hasAnswered else { return }
        selectedOption = option
        isCorrect = (option == correctAnswer)
        if isCorrect { score += 1 }
        hasAnswered = true
    }
    
    func next() {
        guard hasData else { return }
        guard currentIndex < totalQuestions - 1 else {
            showResults = true
            return
        }
        currentIndex += 1
        hasAnswered = false
        selectedOption = nil
        isCorrect = false
        regenerateQuestionAndOptions()
    }
    
    func restart() {
        score = 0
        currentIndex = 0
        hasAnswered = false
        selectedOption = nil
        isCorrect = false
        showResults = false
        regenerateQuestionAndOptions()
    }
    
    
    func localFileURLForCurrentImage() async -> URL? {
        guard hasData else { return nil }
        let remoteStr = currentItem().imageURL
        if let cached = localFileCache[remoteStr] {
            return cached
        }
        do {
            isDownloadingImage = true
            let url = try await RemoteCache.ensureDownloaded(remoteStr)
            localFileCache[remoteStr] = url
            downloadError = nil
            isDownloadingImage = false
            return url
        } catch {
            print("Image download failed:", error)
            downloadError = "Failed to download image."
            isDownloadingImage = false
            return nil
        }
    }
}


enum RemoteCache {
    static func cachedFileURL(for remoteURL: URL) -> URL {
        let caches = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first!
        let name = remoteURL.lastPathComponent.isEmpty ? UUID().uuidString + ".heic" : remoteURL.lastPathComponent
        return caches.appendingPathComponent(name)
    }
    static func fileExistsAndNonEmpty(at url: URL) -> Bool {
        guard let attrs = try? FileManager.default.attributesOfItem(atPath: url.path),
              let size = attrs[.size] as? NSNumber else { return false }
        return size.intValue > 0
    }
    static func ensureDownloaded(_ remoteURLString: String) async throws -> URL {
        guard let remote = URL(string: remoteURLString) else {
            throw URLError(.badURL)
        }
        let dest = cachedFileURL(for: remote)
        if fileExistsAndNonEmpty(at: dest) { return dest }
        let (tmpURL, _) = try await URLSession.shared.download(from: remote)
        try? FileManager.default.removeItem(at: dest)
        try FileManager.default.moveItem(at: tmpURL, to: dest)
        return dest
    }
}


struct StartScreenView: View {
    let isLoading: Bool
    let errorText: String?
    let hasData: Bool
    let onStart: () -> Void
    
    var body: some View {
        VStack(spacing: 28) {
            Text("FamiliAR")
                .font(.system(size: 64, weight: .heavy, design: .rounded))
                .padding(.bottom, 4)
            
            Text("Helps Alzheimer’s patients retain their memories by showing spatial images and tracking memory performance.")
                .font(.title3)
                .multilineTextAlignment(.center)
                .frame(maxWidth: 720)
                .opacity(0.9)
            
            if isLoading {
                ProgressView("Fetching memories…")
            } else if let errorText {
                Text(errorText).foregroundStyle(.red)
            }
            
            Button(action: onStart) {
                Text("Start")
                    .font(.title2)
                    .padding(.horizontal, 36)
                    .padding(.vertical, 16)
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
            .disabled(!hasData || isLoading)
            
            if !hasData && !isLoading {
                Text("No memories found yet.")
                    .font(.footnote)
                    .opacity(0.7)
            }
        }
        .padding()
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}


struct ContentView: View {
    @StateObject private var vm = QuizViewModel()
    
    @State private var didStart: Bool = false
    
    @State private var showQuizUI: Bool = false
    
    @State private var qlURL: URL? = nil
    
    @State private var autoCloseTask: Task<Void, Never>? = nil
    private let previewDuration: TimeInterval = 6.0
    
    @State private var isFetchingMemories = false
    @State private var fetchError: String? = nil
    
    @State private var audioPlayer: AVAudioPlayer? = nil
    
    var body: some View {
        ZStack {
            if !didStart {
                StartScreenView(
                    isLoading: isFetchingMemories,
                    errorText: fetchError,
                    hasData: vm.hasData,
                    onStart: {
                        didStart = true
                        Task { await runPreviewThenSpeakThenRevealQuiz() }
                    }
                )
            } else if vm.showResults {
                ResultsView(score: vm.score, total: vm.totalQuestions) {
                    vm.restart()
                    showQuizUI = false
                    Task { await runPreviewThenSpeakThenRevealQuiz() }
                }
                .padding()
            } else {
                if showQuizUI {
                    // Centered quiz UI (only visible after the image and TTS have started)
                    VStack(spacing: 28) {
                        // Progress
                        Text("Question \(vm.currentIndex + 1) of \(vm.totalQuestions)")
                            .font(.title2)
                            .opacity(0.85)
                        
                        // Big, centered question
                        VStack(spacing: 10) {
                            Text(vm.questionText())
                                .font(.largeTitle)
                                .fontWeight(.bold)
                                .multilineTextAlignment(.center)
                                .frame(maxWidth: 900)
                            
                            // Show context lines for the *other* fields (optional)
                            switch vm.questionType {
                            case .person:
                                Text("Location: \(vm.currentItem().location)").opacity(0.8)
                                Text("Event: \(vm.currentItem().event)").opacity(0.8)
                            case .location:
                                Text("Person: \(vm.currentItem().personName)").opacity(0.8)
                                Text("Event: \(vm.currentItem().event)").opacity(0.8)
                            case .event:
                                Text("Person: \(vm.currentItem().personName)").opacity(0.8)
                                Text("Location: \(vm.currentItem().location)").opacity(0.8)
                            }
                        }
                        .font(.title3)
                        .multilineTextAlignment(.center)
                        
                        // Options (3), centered column
                        VStack(spacing: 16) {
                            ForEach(vm.options, id: \.self) { option in
                                AnswerButton(
                                    title: option,
                                    isSelected: vm.selectedOption == option,
                                    showResultColor: vm.hasAnswered,
                                    isCorrectSelection: vm.hasAnswered && vm.selectedOption == option && vm.isCorrect,
                                    isCorrectOption: option == vm.correctAnswer,
                                    showCorrectBecauseWrong: vm.hasAnswered && !vm.isCorrect
                                ) { vm.select(option: option) }
                                .frame(maxWidth: 560)
                                .disabled(vm.hasAnswered)
                            }
                        }
                        
                        // Show correct answer after a wrong selection
                        if vm.hasAnswered && !vm.isCorrect {
                            Text("Correct answer: \(vm.correctAnswer)")
                                .font(.title3)
                                .fontWeight(.semibold)
                                .foregroundStyle(.green)
                                .transition(.opacity)
                        }
                        
                        // Controls row: See again + Next
                        HStack(spacing: 16) {
                            Button("See again") {
                                // Replay the image (does not replay audio; easy to add if needed)
                                Task { await presentCurrentImageForNSeconds() }
                            }
                            .buttonStyle(.bordered)
                            .disabled(vm.isDownloadingImage)
                            
                            Button(action: {
                                vm.next()
                                // For next question, hide quiz until the image has been shown and TTS started
                                showQuizUI = false
                                Task { await runPreviewThenSpeakThenRevealQuiz() }
                            }) {
                                Text(vm.currentIndex == vm.totalQuestions - 1 ? "See Score" : "Next")
                                    .font(.title3)
                                    .padding(.horizontal, 26)
                                    .padding(.vertical, 14)
                            }
                            .buttonStyle(.borderedProminent)
                            .disabled(!vm.hasAnswered)
                        }
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .overlay(alignment: .top) {
                        if vm.isDownloadingImage {
                            ProgressView("Loading photo…").padding(.top, 8)
                        } else if let err = vm.downloadError {
                            Text(err).foregroundStyle(.red).padding(.top, 8)
                        }
                    }
                    .padding()
                } else {
                    // Transitional state while preparing/downloading, previewing, and starting TTS
                    VStack(spacing: 16) {
                        ProgressView("Preparing next photo…")
                        Text("Please wait")
                            .opacity(0.7)
                    }
                }
            }
        }
        // Square-leaning window by default
        .frame(minWidth: 900, idealWidth: 1100, maxWidth: 1400,
               minHeight: 900, idealHeight: 1100, maxHeight: 1400)
        .aspectRatio(1.0, contentMode: .fit)
        // Quick Look presentation for the spatial HEIC
        .quickLookPreview($qlURL)
        // Fetch Supabase memories BEFORE Start is pressed
        .task { await fetchAllMemoriesOnLaunch() }
        .onAppear { configureAudioSession() }
        .onDisappear {
            autoCloseTask?.cancel()
            audioPlayer?.stop()
        }
    }
    
    // MARK: Fetch memories on launch
    private func fetchAllMemoriesOnLaunch() async {
        isFetchingMemories = true
        fetchError = nil
        await vm.loadMemoriesFromSupabase()
        isFetchingMemories = false
        if !vm.hasData {
            fetchError = "No memories found or fetch failed."
        }
    }
    
    // MARK: Flow helpers (Image + TTS + then Quiz UI)
    
    /// Full flow for each question: ensure image is downloaded, show preview for N seconds,
    /// start TTS immediately, then reveal quiz UI after preview closes.
    private func runPreviewThenSpeakThenRevealQuiz() async {
        autoCloseTask?.cancel()
        audioPlayer?.stop()
        
        // 1) Ensure image is downloaded
        guard let local = await vm.localFileURLForCurrentImage() else {
            // If download fails, allow the quiz (so user isn't stuck)
            await MainActor.run { showQuizUI = true }
            return
        }
        
        // 2) Present image via Quick Look for N seconds (quiz hidden during this)
        await MainActor.run { qlURL = local }
        
        // 3) Fire TTS request right away (don't block the image preview)
        let (ttsText, ttsVoice): (String, String?) = await MainActor.run {
            let item = vm.currentItem()
            return (vm.questionType.spokenPrompt(for: item), item.voiceID)
        }

        // Do the network/audio work off the MainActor
        Task.detached { [ttsText, ttsVoice] in
            await self.speak(text: ttsText, preferredVoiceID: ttsVoice)
        }
        
        // 4) Close image after N sec and show quiz
        autoCloseTask = Task { @MainActor in
            try? await Task.sleep(nanoseconds: UInt64(previewDuration * 1_000_000_000))
            if !Task.isCancelled { qlURL = nil }
            showQuizUI = true
        }
    }
    
    /// Replay the image for N seconds but keep the quiz visible afterwards (no TTS here).
    private func presentCurrentImageForNSeconds() async {
        autoCloseTask?.cancel()
        guard let local = await vm.localFileURLForCurrentImage() else { return }
        await MainActor.run { qlURL = local }
        autoCloseTask = Task { @MainActor in
            try? await Task.sleep(nanoseconds: UInt64(previewDuration * 1_000_000_000))
            if !Task.isCancelled { qlURL = nil }
        }
    }
    
    // MARK: - Audio / TTS
    
    private func configureAudioSession() {
        do {
            try AVAudioSession.sharedInstance().setCategory(.playback, mode: .spokenAudio, options: [.interruptSpokenAudioAndMixWithOthers])
            try AVAudioSession.sharedInstance().setActive(true)
        } catch {
            print("⚠️ AVAudioSession error:", error)
        }
    }
    
    /// Builds and plays TTS audio for the given text using the memory's voiceID or fallback.
    private func speak(text: String, preferredVoiceID: String?) async {
        guard !ELEVENLABS_API_KEY.isEmpty else {
            print("⚠️ Missing ElevenLabs API key; skipping TTS")
            return
        }
        guard let voice = preferredVoiceID ?? DEFAULT_VOICE_ID else {
            print("ℹ️ No voice ID provided and no default voice set; skipping TTS")
            return
        }
        do {
            let data = try await TTSManager.fetchSpeechData(apiKey: ELEVENLABS_API_KEY, voiceID: voice, text: text)
            await MainActor.run {
                do {
                    audioPlayer = try AVAudioPlayer(data: data)
                    audioPlayer?.prepareToPlay()
                    audioPlayer?.play()
                } catch {
                    print("⚠️ Failed to play TTS audio:", error)
                }
            }
        } catch {
            print("⚠️ TTS request failed:", error)
        }
    }
}


struct ResultsView: View {
    let score: Int
    let total: Int
    let onRestart: () -> Void
    
    var pct: Double { total == 0 ? 0 : Double(score) / Double(total) }
    var color: Color {
        switch pct {
        case 0.75...:     return .green
        case 0.5..<0.75:  return .yellow
        default:          return .red
        }
    }
    
    var body: some View {
        VStack(spacing: 28) {
            Text("Quiz Complete")
                .font(.system(size: 42, weight: .bold))
                .multilineTextAlignment(.center)
            
            CircularScoreView(score: score, total: total, color: color)
                .frame(width: 220, height: 220)
                .padding(.top, 8)
            
            Button(action: onRestart) {
                Text("Restart")
                    .font(.title3)
                    .padding(.horizontal, 28)
                    .padding(.vertical, 14)
            }
            .buttonStyle(.borderedProminent)
        }
        .frame(maxWidth: 600)
        .padding(.vertical, 24)
    }
}

struct CircularScoreView: View {
    let score: Int
    let total: Int
    let color: Color
    
    var pct: Double { total == 0 ? 0 : Double(score) / Double(total) }
    
    var body: some View {
        ZStack {
            Circle()
                .stroke(lineWidth: 16)
                .foregroundStyle(.secondary.opacity(0.2))
            Circle()
                .trim(from: 0, to: pct)
                .stroke(style: StrokeStyle(lineWidth: 16, lineCap: .round, lineJoin: .round))
                .foregroundStyle(color)
                .rotationEffect(.degrees(-90))
            VStack(spacing: 6) {
                Text("\(score) / \(total)")
                    .font(.system(size: 36, weight: .bold, design: .rounded))
                Text("\(Int(pct * 100))%")
                    .font(.headline)
                    .opacity(0.8)
            }
        }
        .animation(.easeOut(duration: 0.6), value: pct)
    }
}

// MARK: - Answer Button

struct AnswerButton: View {
    let title: String
    let isSelected: Bool
    let showResultColor: Bool
    let isCorrectSelection: Bool
    let isCorrectOption: Bool
    let showCorrectBecauseWrong: Bool
    let action: () -> Void
    
    var body: some View {
        Button(action: action) {
            HStack(spacing: 14) {
                Text(title)
                    .font(.title2)
                    .fontWeight(.semibold)
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)
                    .minimumScaleFactor(0.85)
                Spacer()
                if showResultColor && isSelected {
                    Image(systemName: isCorrectSelection ? "checkmark.circle.fill" : "xmark.circle.fill")
                        .imageScale(.large)
                } else if showCorrectBecauseWrong && isCorrectOption {
                    Image(systemName: "checkmark.circle.fill")
                        .imageScale(.large)
                }
            }
            .padding(.horizontal, 20)
            .padding(.vertical, 16)
            .background(backgroundColor)
            .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 18, style: .continuous)
                    .strokeBorder(borderColor, lineWidth: 1.2)
            )
        }
        .buttonStyle(.plain)
        .frame(maxWidth: 560)
    }
    
    private var backgroundColor: Color {
        guard showResultColor else { return Color.secondary.opacity(0.08) }
        if isSelected { return isCorrectSelection ? Color.green.opacity(0.28) : Color.red.opacity(0.28) }
        if showCorrectBecauseWrong && isCorrectOption { return Color.green.opacity(0.18) }
        return Color.secondary.opacity(0.08)
    }
    private var borderColor: Color {
        guard showResultColor else { return .secondary.opacity(0.25) }
        if isSelected { return isCorrectSelection ? .green : .red }
        if showCorrectBecauseWrong && isCorrectOption { return .green }
        return .secondary.opacity(0.25)
    }
}

// MARK: - Remote Cache, Start Screen, Preview

#Preview(windowStyle: .automatic) {
    ContentView()
}
