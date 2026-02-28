"use client"

import { useFavorites } from "@/lib/favorites-context"
import { useAuth } from "@/lib/auth-context"

export default function DebugPage() {
  const { state: favoritesState, loading } = useFavorites()
  const { state: authState } = useAuth()

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <h1 className="text-3xl font-bold mb-8">Debug Page</h1>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Auth State */}
        <div className="bg-white p-6 rounded-lg shadow">
          <h2 className="text-xl font-semibold mb-4">Auth State</h2>
          <pre className="bg-gray-100 p-4 rounded text-sm overflow-auto">
            {JSON.stringify(authState, null, 2)}
          </pre>
                  </div>

        {/* Favorites State */}
        <div className="bg-white p-6 rounded-lg shadow">
          <h2 className="text-xl font-semibold mb-4">Favorites State</h2>
          <div className="mb-4">
            <p><strong>Loading:</strong> {loading ? 'Yes' : 'No'}</p>
            <p><strong>Count:</strong> {favoritesState.count}</p>
            <p><strong>Items:</strong> {favoritesState.items.length}</p>
                          </div>

          {favoritesState.items.length > 0 && (
            <div className="space-y-4">
              <h3 className="font-semibold">Favorites Items:</h3>
              {favoritesState.items.map((item, index) => (
                <div key={index} className="border p-4 rounded bg-gray-50">
                  <h4 className="font-medium">{item.name}</h4>
                  <p><strong>ID:</strong> {item.id}</p>
                  <p><strong>Category:</strong> {item.category}</p>
                  <p><strong>Price:</strong> {item.price}</p>
                  <p><strong>isGiftPackage:</strong> {item.isGiftPackage ? 'Yes' : 'No'}</p>
                  <p><strong>packagePrice:</strong> {item.packagePrice || 'N/A'}</p>
                  <p><strong>packageOriginalPrice:</strong> {item.packageOriginalPrice || 'N/A'}</p>
                  <p><strong>giftPackageSizes:</strong> {item.giftPackageSizes ? `${item.giftPackageSizes.length} sizes` : 'N/A'}</p>
                  <p><strong>sizes:</strong> {item.sizes ? `${item.sizes.length} sizes` : 'N/A'}</p>
                  <p><strong>Image:</strong> {item.image}</p>
                  
                  {item.isGiftPackage && item.giftPackageSizes && (
                    <div className="mt-2 p-2 bg-blue-50 rounded">
                      <strong>Gift Package Details:</strong>
                      <pre className="text-xs mt-1 overflow-auto">
                        {JSON.stringify(item.giftPackageSizes, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              ))}
                  </div>
          )}
        </div>
      </div>

      {/* Raw Favorites Data */}
      <div className="mt-8 bg-white p-6 rounded-lg shadow">
        <h2 className="text-xl font-semibold mb-4">Raw Favorites Data</h2>
        <pre className="bg-gray-100 p-4 rounded text-sm overflow-auto">
          {JSON.stringify(favoritesState, null, 2)}
        </pre>
      </div>
    </div>
  )
}
