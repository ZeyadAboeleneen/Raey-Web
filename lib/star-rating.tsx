import { Star } from "lucide-react"

interface StarRatingProps {
  rating: number
  className?: string
  starClassName?: string
}

export function StarRating({ rating, className = "", starClassName = "h-4 w-4" }: StarRatingProps) {
  const fullStars = Math.floor(rating)
  const hasPartialStar = rating % 1 !== 0
  const partialStarFill = rating % 1

  return (
    <div className={`flex items-center ${className}`}>
      {[...Array(5)].map((_, i) => {
        if (i < fullStars) {
          return (
            <Star
              key={i}
              className={`${starClassName} fill-yellow-400 text-yellow-400`}
            />
          )
        } else if (i === fullStars && hasPartialStar) {
          return (
            <div key={i} className="relative">
              <Star className={`${starClassName} text-gray-300`} />
              <div 
                className={`absolute top-0 left-0 overflow-hidden`}
                style={{ width: `${partialStarFill * 100}%` }}
              >
                <Star className={`${starClassName} fill-yellow-400 text-yellow-400`} />
              </div>
            </div>
          )
        } else {
          return (
            <Star
              key={i}
              className={`${starClassName} text-gray-300`}
            />
          )
        }
      })}
    </div>
  )
}
