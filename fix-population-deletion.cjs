const fs = require('fs');
const path = require('path');

// Read the current file
const filePath = 'public/js/modules/pingone-client.js';
let content = fs.readFileSync(filePath, 'utf8');

// Find the problematic method and replace it with a safer version
const oldMethod = /async getAllUsersInPopulationReliable\(populationId\) \{[\s\S]*?\}/;
const newMethod = `async getAllUsersInPopulationReliable(populationId) {
        this.logger.info(\`[RELIABLE] Starting safe fetch for population: \${populationId}\`);
        
        const settings = this.getSettings();
        const users = [];
        let page = 1;
        const pageSize = 100;
        const maxPages = 20; // Much stricter limit
        let fetched = 0;
        let consecutiveEmptyPages = 0;
        
        do {
            // Safety checks
            if (page > maxPages) {
                this.logger.warn(\`[RELIABLE] Reached maximum page limit (\${maxPages})\`);
                break;
            }
            
            if (consecutiveEmptyPages >= 3) {
                this.logger.warn(\`[RELIABLE] Too many consecutive empty pages, stopping\`);
                break;
            }
            
            try {
                const resp = await this.request('GET', 
                    \`/environments/\${settings.environmentId}/users?limit=\${pageSize}&page=\${page}&filter=population.id eq "\${populationId}"\`
                );
                
                if (resp && resp._embedded && resp._embedded.users && Array.isArray(resp._embedded.users)) {
                    const pageUsers = resp._embedded.users;
                    fetched = pageUsers.length;
                    
                    if (fetched > 0) {
                        users.push(...pageUsers);
                        consecutiveEmptyPages = 0;
                        this.logger.debug(\`[RELIABLE] Page \${page}: fetched \${fetched} users, total: \${users.length}\`);
                    } else {
                        consecutiveEmptyPages++;
                        this.logger.debug(\`[RELIABLE] Page \${page}: no users (consecutive empty: \${consecutiveEmptyPages})\`);
                    }
                } else {
                    consecutiveEmptyPages++;
                    this.logger.warn(\`[RELIABLE] Invalid response at page \${page}\`);
                }
            } catch (error) {
                this.logger.error(\`[RELIABLE] Error at page \${page}:\`, error);
                break;
            }
            
            page++;
            
            // Add small delay between requests
            await new Promise(resolve => setTimeout(resolve, 100));
            
        } while (fetched > 0 && page <= maxPages && consecutiveEmptyPages < 3);
        
        this.logger.info(\`[RELIABLE] Finished safe pagination: \${users.length} users total (\${page - 1} pages)\`);
        return users;
    }`;

// Replace the method
content = content.replace(oldMethod, newMethod);

// Write the fixed file
fs.writeFileSync(filePath, content, 'utf8');
console.log('Fixed the getAllUsersInPopulationReliable method!');
