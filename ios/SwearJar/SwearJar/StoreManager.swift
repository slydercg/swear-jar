import StoreKit

@MainActor
class StoreManager: ObservableObject {
    static let shared = StoreManager()

    @Published var products: [Product] = []
    @Published var isPremium: Bool = false

    // Product IDs — configure in App Store Connect
    static let premiumMonthly = "com.slyder.swearjar.premium.monthly"
    static let premiumYearly = "com.slyder.swearjar.premium.yearly"

    private var updateTask: Task<Void, Never>?

    init() {
        updateTask = Task {
            for await result in Transaction.updates {
                if case .verified(let transaction) = result {
                    isPremium = true
                    await transaction.finish()
                }
            }
        }
    }

    func loadProducts() async {
        do {
            products = try await Product.products(for: [
                Self.premiumMonthly,
                Self.premiumYearly,
            ])
        } catch {
            // Products not configured yet — expected during development
        }
    }

    func purchase(_ product: Product) async -> Bool {
        do {
            let result = try await product.purchase()
            switch result {
            case .success(let verification):
                if case .verified(let transaction) = verification {
                    isPremium = true
                    await transaction.finish()
                    return true
                }
            case .pending, .userCancelled:
                break
            @unknown default:
                break
            }
        } catch {}
        return false
    }

    func restorePurchases() async {
        for await result in Transaction.currentEntitlements {
            if case .verified(_) = result {
                isPremium = true
            }
        }
    }
}
