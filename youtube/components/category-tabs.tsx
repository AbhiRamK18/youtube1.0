"use client";
import { useState } from 'react'
import { Button } from './ui/button';
const categories = [
    'All',
    'Gaming',
    'Music',
    'Sports',
    'News',
    'Movies',
    'Technology',
    'Education',
    'Comedy',
    'Travel',
    'Science',
    'Health',
    'Art',
    
]
const CategoryTabs = () => {
 const [activeCategory, setActiveCategory] = useState('All');
  return (
    <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
      {categories.map((category) => (
        <Button
          key={category}
          variant={activeCategory === category ? "default" : "secondary"}
          className="whitespace-nowrap"
          onClick={() => setActiveCategory(category)}
        >
          {category}
        </Button>
      ))}
      
    </div>
  )
}

export default CategoryTabs
