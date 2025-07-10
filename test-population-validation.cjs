// Test script to verify population validation logic
const fs = require('fs');
const path = require('path');

// Sample CSV data from user
const csvData = `username,email,populationId,firstName,middleName,lastName,prefix,suffix,formattedName,nickname,title,preferredLanguage,locale,timezone,externalId,type,active,primaryPhone,mobilePhone,streetAddress,countryCode,locality,region,postalCode,password
lkelly950,lkelly950@mailinator.com,1dd684e3-82ee-4e68-9d25-00401bc62e7a,Jane,B,Doe,Ms.,PhD,"Ms. Jane B Doe, PhD",Janie,Engineer,en,US,America/New_York,ext-0950,employee,True,555-111-2222,555-333-4444,123 Main St,US,New York,NY,10001,2Federate!
joelstewart951,joelstewart951@mailinator.com,1dd684e3-82ee-4e68-9d25-00401bc62e7a,Jane,B,Doe,Ms.,PhD,"Ms. Jane B Doe, PhD",Janie,Engineer,en,US,America/New_York,ext-0951,employee,True,555-111-2222,555-333-4444,123 Main St,US,New York,NY,10001,2Federate!
robin05952,robin05952@mailinator.com,1dd684e3-82ee-4e68-9d25-00401bc62e7a,Jane,B,Doe,Ms.,PhD,"Ms. Jane B Doe, PhD",Janie,Engineer,en,US,America/New_York,ext-0952,employee,True,555-111-2222,555-333-4444,123 Main St,US,New York,NY,10001,2Federate!`;

// Available populations from logs
const availablePopulations = [
    {
        id: "3840c98d-202d-4f6a-8871-f3bc66cb3fa8",
        name: "Sample Users",
        userCount: 330
    },
    {
        id: "6fe3f6ea-39c5-4ad7-990b-53802bbcda49", 
        name: "More Sample Users",
        userCount: 0
    },
    {
        id: "48af9c64-24fd-4eea-a8eb-16b7e4744fc8",
        name: "TEST", 
        userCount: 50
    }
];

// CSV population ID from user's data
const csvPopulationId = "1dd684e3-82ee-4e68-9d25-00401bc62e7a";

// Test population validation logic
function testPopulationValidation() {
    console.log("=== Population Validation Test ===\n");
    
    // Test 1: Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const isValidFormat = uuidRegex.test(csvPopulationId);
    console.log(`1. UUID Format Validation:`);
    console.log(`   CSV Population ID: ${csvPopulationId}`);
    console.log(`   Valid UUID Format: ${isValidFormat ? '✅ YES' : '❌ NO'}\n`);
    
    // Test 2: Check if population exists in PingOne
    const populationExists = availablePopulations.some(pop => pop.id === csvPopulationId);
    console.log(`2. Population Existence Check:`);
    console.log(`   Available Populations:`);
    availablePopulations.forEach(pop => {
        console.log(`     - ${pop.name} (${pop.id.slice(-8)}) - ${pop.userCount} users`);
    });
    console.log(`   CSV Population ID exists: ${populationExists ? '✅ YES' : '❌ NO'}\n`);
    
    // Test 3: Simulate import behavior
    console.log(`3. Import Behavior Simulation:`);
    console.log(`   Scenario A: "Use CSV population ID" = CHECKED`);
    if (isValidFormat && populationExists) {
        console.log(`   ✅ Would use CSV population ID: ${csvPopulationId}`);
    } else if (isValidFormat && !populationExists) {
        console.log(`   ⚠️  CSV population ID doesn't exist, would fall back to UI-selected population`);
    } else {
        console.log(`   ❌ Invalid CSV population ID format, would fall back to UI-selected population`);
    }
    
    console.log(`   Scenario B: "Use CSV population ID" = UNCHECKED`);
    console.log(`   ✅ Would use UI-selected population (Sample Users, TEST, or More Sample Users)`);
    
    console.log(`\n=== Test Complete ===`);
}

testPopulationValidation(); 