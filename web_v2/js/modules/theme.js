/**
 * theme.js - Gerenciamento de tema (claro/escuro)
 */

class ThemeManager {
    constructor() {
        this.themeToggleBtn = null;
        this.themeTextElement = null;
        this.currentTheme = 'dark'; // Padrão
    }
    
    /**
     * Inicializa o gerenciador de temas
     */
    initialize() {
        // Busca elementos no DOM
        this.themeToggleBtn = document.getElementById('themeToggleBtn');
        this.themeTextElement = document.getElementById('themeText');
        
        if (!this.themeToggleBtn) {
            console.error('Botão de alternância de tema não encontrado');
            return;
        }
        
        // Carrega tema salvo
        this.loadSavedTheme();
        
        // Configura event listener para o botão
        this.themeToggleBtn.addEventListener('click', () => this.toggleTheme());
    }
    
    /**
     * Carrega o tema salvo no localStorage
     */
    loadSavedTheme() {
        const savedTheme = localStorage.getItem('theme');
        
        if (savedTheme) {
            this.currentTheme = savedTheme;
            const isLightTheme = savedTheme === 'light';
            
            if (isLightTheme) {
                document.body.classList.add('light-theme');
                
                // Atualiza o logo
                const logoImage = document.getElementById('logoImage');
                if (logoImage) {
                    logoImage.src = 'imgs/verona_logo_white.png';
                }
            }
            
            this.updateButtonUI();
        }
    }
    
    /**
     * Alterna entre temas claro e escuro
     */
    toggleTheme() {
        const isLightTheme = document.body.classList.toggle('light-theme');
        this.currentTheme = isLightTheme ? 'light' : 'dark';
        
        // Adicione estes logs
        console.log("Tema alterado para:", this.currentTheme);
        
        // Atualiza o logo
        const logoImage = document.getElementById('logoImage');
        if (logoImage) {
            const newSrc = isLightTheme ? 'imgs/verona_logo_white.png' : 'imgs/verona_logo.png';
            console.log("Alterando logo para:", newSrc);
            logoImage.src = newSrc;
        } else {
            console.error("Elemento do logo não encontrado!");
        }
        
        this.updateButtonUI();
        this.saveThemePreference();
    }
    
    /**
     * Atualiza a interface do botão de tema
     * Nota: Com o novo design, não precisamos de muito aqui,
     * pois a alternância dos ícones é feita com CSS
     */
    updateButtonUI() {
        if (this.themeTextElement) {
            this.themeTextElement.textContent = this.currentTheme === 'light' 
                ? 'Tema Escuro' 
                : 'Tema Claro';
        }
        
        // Atualiza o rótulo de acessibilidade
        if (this.themeToggleBtn) {
            this.themeToggleBtn.setAttribute('aria-label', 
                this.currentTheme === 'light' 
                    ? 'Alternar para tema escuro' 
                    : 'Alternar para tema claro'
            );
        }
    }
    
    /**
     * Salva a preferência de tema no localStorage
     */
    saveThemePreference() {
        localStorage.setItem('theme', this.currentTheme);
    }
    
    /**
     * Define um tema específico
     * @param {string} theme - 'light' ou 'dark'
     */
    setTheme(theme) {
        if (theme !== 'light' && theme !== 'dark') return;
        
        if (theme === 'light') {
            document.body.classList.add('light-theme');
        } else {
            document.body.classList.remove('light-theme');
        }
        
        this.currentTheme = theme;
        this.updateButtonUI();
        this.saveThemePreference();
    }
    
    /**
     * Obtém o tema atual
     * @returns {string} Tema atual ('light' ou 'dark')
     */
    getCurrentTheme() {
        return this.currentTheme;
    }
}

// Exporta uma instância única do gerenciador de temas
export default new ThemeManager();