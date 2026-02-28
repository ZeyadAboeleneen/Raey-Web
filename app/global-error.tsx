"use client"

import { useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Log the error to an error reporting service
    console.error("Global application error:", error)
  }, [error])

  return (
    <html>
      <body>
        <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
          <Card className="max-w-md w-full">
            <CardContent className="pt-6">
              <div className="text-center space-y-4">
                <h2 className="text-2xl font-bold text-gray-900">Something went wrong!</h2>
                <p className="text-gray-600">
                  {error.message || "An unexpected error occurred"}
                </p>
                {error.digest && (
                  <p className="text-sm text-gray-500">Error ID: {error.digest}</p>
                )}
                <div className="flex gap-4 justify-center pt-4">
                  <Button onClick={reset} className="bg-black text-white hover:bg-gray-800">
                    Try again
                  </Button>
                  <Button
                    onClick={() => window.location.href = "/"}
                    variant="outline"
                  >
                    Go home
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </body>
    </html>
  )
}

