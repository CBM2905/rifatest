// Carga las variables de entorno
const loadEnvVariables = async () => {
  try {
    const response = await fetch('/.env');
    const text = await response.text();
    const vars = text.split('\n').reduce((acc, line) => {
      const [key, value] = line.split('=');
      if (key && value) {
        acc[key.trim()] = value.trim();
      }
      return acc;
    }, {});
    
    window.process = {
      env: vars
    };
  } catch (error) {
    console.error('Error loading environment variables:', error);
  }
};

loadEnvVariables();