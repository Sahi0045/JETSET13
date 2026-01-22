import defaultTheme from 'tailwindcss/defaultTheme';
import forms from '@tailwindcss/forms';

/** @type {import('tailwindcss').Config} */
export default {
    content: [
        './vendor/laravel/framework/src/Illuminate/Pagination/resources/views/*.blade.php',
        './storage/framework/views/*.php',
        './resources/views/**/*.blade.php',
        './resources/js/**/*.jsx',
        './index.html',
        './src/**/*.{js,ts,jsx,tsx}',
    ],

    theme: {
        extend: {
            fontFamily: {
                sans: ['Inter', 'Figtree', ...defaultTheme.fontFamily.sans],
                display: ['Inter', 'Figtree', ...defaultTheme.fontFamily.sans],
            },
            colors: {
                // Primary brand colors (Coastal Theme)
                primary: {
                    50: '#f0f9ff',
                    100: '#B9D0DC', // Pale Blue (Base/Light)
                    200: '#9bcbe3',
                    300: '#7abde1',
                    400: '#65B3CF', // Sky Blue (Bright/Vibrant - Main Action)
                    500: '#055B75', // Deep Teal (Primary Brand - Contrast)
                    600: '#044a60',
                    700: '#033a4c',
                    800: '#022b39',
                    900: '#011c26',
                    950: '#000f15',
                },
                secondary: {
                    50: '#f7f7f6',
                    100: '#eef0ef',
                    200: '#dde0de',
                    300: '#c5c8c5',
                    400: '#a7aaa5',
                    500: '#7F8073', // Olive Taupe (Natural/Warm)
                    600: '#64655a',
                    700: '#4e4f45',
                    800: '#3a3b33',
                    900: '#282923',
                },
                neutral: {
                    50: '#f9fafb', // Lighter than slate-50
                    100: '#f3f4f6',
                    200: '#e5e7eb',
                    300: '#d1d5db',
                    400: '#9ca3af',
                    500: '#6b7280',
                    600: '#4b5563',
                    700: '#626363', // Soft Charcoal (Text)
                    800: '#1f2937',
                    900: '#111827',
                },
                // Keeping existing accent but making it compatible if needed
                accent: {
                    50: '#fef3c7',
                    100: '#fde68a',
                    200: '#fcd34d',
                    300: '#fbbf24',
                    400: '#f59e0b',
                    500: '#d97706',
                    600: '#b45309',
                    700: '#92400e',
                    800: '#78350f',
                    900: '#451a03',
                },
                success: {
                    50: '#ecfdf5',
                    100: '#d1fae5',
                    200: '#a7f3d0',
                    300: '#6ee7b7',
                    400: '#34d399',
                    500: '#10b981',
                    600: '#059669',
                    700: '#047857',
                    800: '#065f46',
                    900: '#064e3b',
                },
                warning: {
                    50: '#fffbeb',
                    100: '#fef3c7',
                    200: '#fde68a',
                    300: '#fcd34d',
                    400: '#fbbf24',
                    500: '#f59e0b',
                    600: '#d97706',
                    700: '#b45309',
                    800: '#92400e',
                    900: '#78350f',
                },
                error: {
                    50: '#fef2f2',
                    100: '#fee2e2',
                    200: '#fecaca',
                    300: '#fca5a5',
                    400: '#f87171',
                    500: '#ef4444',
                    600: '#dc2626',
                    700: '#b91c1c',
                    800: '#991b1b',
                    900: '#7f1d1d',
                },
            },
            spacing: {
                '18': '4.5rem',
                '88': '22rem',
                '128': '32rem',
            },
            borderRadius: {
                '4xl': '2rem',
                '5xl': '2.5rem',
            },
            boxShadow: {
                'soft': '0 2px 15px -3px rgba(5, 91, 117, 0.05), 0 10px 20px -2px rgba(5, 91, 117, 0.02)', // Tinted w/ Teal
                'medium': '0 4px 25px -5px rgba(5, 91, 117, 0.08), 0 10px 10px -5px rgba(5, 91, 117, 0.03)',
                'large': '0 10px 40px -10px rgba(5, 91, 117, 0.12), 0 20px 25px -5px rgba(5, 91, 117, 0.08)',
                'glow': '0 0 20px rgba(101, 179, 207, 0.4)', // Sky Blue Glow
                'glow-lg': '0 0 30px rgba(101, 179, 207, 0.5)',
            },
            animation: {
                'fade-in': 'fadeIn 0.5s ease-in-out',
                'fade-in-up': 'fadeInUp 0.6s ease-out',
                'fade-in-down': 'fadeInDown 0.6s ease-out',
                'slide-in-left': 'slideInLeft 0.5s ease-out',
                'slide-in-right': 'slideInRight 0.5s ease-out',
                'bounce-gentle': 'bounceGentle 2s infinite',
                'pulse-gentle': 'pulseGentle 2s infinite',
                'float': 'float 3s ease-in-out infinite',
            },
            keyframes: {
                fadeIn: {
                    '0%': { opacity: '0' },
                    '100%': { opacity: '1' },
                },
                fadeInUp: {
                    '0%': { opacity: '0', transform: 'translateY(20px)' },
                    '100%': { opacity: '1', transform: 'translateY(0)' },
                },
                fadeInDown: {
                    '0%': { opacity: '0', transform: 'translateY(-20px)' },
                    '100%': { opacity: '1', transform: 'translateY(0)' },
                },
                slideInLeft: {
                    '0%': { opacity: '0', transform: 'translateX(-20px)' },
                    '100%': { opacity: '1', transform: 'translateX(0)' },
                },
                slideInRight: {
                    '0%': { opacity: '0', transform: 'translateX(20px)' },
                    '100%': { opacity: '1', transform: 'translateX(0)' },
                },
                bounceGentle: {
                    '0%, 100%': { transform: 'translateY(-5%)' },
                    '50%': { transform: 'translateY(0)' },
                },
                pulseGentle: {
                    '0%, 100%': { opacity: '1' },
                    '50%': { opacity: '0.8' },
                },
                float: {
                    '0%, 100%': { transform: 'translateY(0px)' },
                    '50%': { transform: 'translateY(-10px)' },
                },
            },
            backdropBlur: {
                xs: '2px',
            },
            typography: {
                DEFAULT: {
                    css: {
                        color: '#626363', // Soft Charcoal
                        maxWidth: 'none',
                    },
                },
            },
        },
    },

    plugins: [
        forms,
        function ({ addUtilities }) {
            const newUtilities = {
                '.glass': {
                    'background': 'rgba(255, 255, 255, 0.7)',
                    'backdrop-filter': 'blur(12px)',
                    'border': '1px solid rgba(255, 255, 255, 0.5)',
                },
                '.glass-dark': {
                    'background': 'rgba(5, 91, 117, 0.4)', // Deep Teal tint
                    'backdrop-filter': 'blur(12px)',
                    'border': '1px solid rgba(255, 255, 255, 0.1)',
                },
                '.gradient-primary': {
                    'background': 'linear-gradient(135deg, #055B75 0%, #65B3CF 100%)', // Deep Teal to Sky Blue
                },
                '.gradient-secondary': {
                    'background': 'linear-gradient(135deg, #7F8073 0%, #a7aaa5 100%)', // Olive Taupe Gradient
                },
                '.text-gradient': {
                    'background': 'linear-gradient(135deg, #055B75 0%, #65B3CF 100%)',
                    '-webkit-background-clip': 'text',
                    '-webkit-text-fill-color': 'transparent',
                    'background-clip': 'text',
                },
            }
            addUtilities(newUtilities)
        }
    ],
};
