/** @type {import('tailwindcss').Config} */
const googleSansStack = [
  '"Google Sans"',
  '"Noto Sans SC"',
  '"Noto Sans JP"',
  '"PingFang SC"',
  '"Microsoft YaHei"',
  'sans-serif'
]

export default {
  content: ['./index.html', './src/**/*.{vue,js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: googleSansStack,
        mono: googleSansStack
      }
    }
  },
  plugins: []
}
