import http from 'http';
import Candidate from '../models/User.js';
import AdminApproval from '../models/AdminApproval.js';
import GlobalApproval from '../models/GlobalApproval.js';
import Admin from '../models/AdminBase.js';
import GlobalChainState from '../models/GlobalChainState.js';


// Your API base (adjust port if needed – you used 5000 in one route)
const API_BASE = 'http://localhost:5000/api';

// Helper to call the admin creation endpoint
function createAdmin(adminData) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(adminData);
    const options = {
      hostname: 'localhost',
      port: 5000,            // assuming your backend runs on port 5000
      path: API_BASE + '/owner/add-admin', // adjust if needed
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
      },
    };
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200 || res.statusCode === 201) {
          try {
            const result = JSON.parse(data);
            console.log(result)
            resolve(result.adminId || result._id);
          } catch (e) {
            reject(e);
          }
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        }
      });
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

// Helper to call the candidate creation endpoint
function createCandidate(candidateData) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(candidateData);
    const options = {
      hostname: 'localhost',
      port: 5000,
      path: API_BASE + '/common/add-new-candidate', // adjust if needed
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
      },
    };
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200 || res.statusCode === 201) {
          try {
            const result = JSON.parse(data);
            console.log(result)
            resolve(result.adminId || result._id); // here if result is undefined or null, accessing result._id will throw
            } catch (e) {
            reject(e);
          }
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        }
      });
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

async function seed() {
  try {
    const adminIds = [];

    // console.log("JJJJS")
    await Candidate.deleteMany({ });
    await AdminApproval.deleteMany({});
    await GlobalApproval.deleteMany({});
    await GlobalChainState.deleteMany({});
    // await Admin.updateMany({},{$set:{"approvalsToday":0}});
    await Admin.deleteMany({});
    // console.log("JJJJS")

    // for (let i = 1; i <= 10; i++) {
    //   try {
    //     const adminId = await createAdmin({
    //       firstName: `TestAdmin${i}`,
    //       lastName: 'Test',
    //       userEmail: `admin${i}@test.com`,
    //       phoneNumber: `9999888898`,
    //       userPassword: `Admin${i}`,
    //       percentageShare: `${i*6}`,
    //       communityList: ['TEST_COMMUNITY'],
    //       isTestData:true
    //       // any other required fields for admin creation (e.g., password)
    //     });
    //     adminIds.push({"adminId":adminId._id, "ref":adminId.referenceCode});
    //     console.log(`Created admin ${i}: ${adminId}`);
    //   } catch (err) {
    //     console.error(`Failed to create admin ${i}:`, err.message);
    //   }
    // }

    // const referenceCodes = ["TES2938","TES6967","TES99X8","TES6635","TES7285","TES9529","TES2996","TES9993","TES89X6","TES2835"];
    // const candidateIds = [];
    // for (let i = 1; i <= 500; i++) {
    //   try {
    //     const randomRefCode = referenceCodes[Math.floor(Math.random() * referenceCodes.length)];
    //     const candidateId = await createCandidate({
    //       firstName: `Candidate ${i}`,
    //       lastName: 'Test',
    //       userEmail: `candidate${i}@test.com`,
    //       userPassword: `abc${i}`,
    //       phoneNumber: "9988998899",
    //       referenceCode: randomRefCode,
    //       lookingFor: i % 2 === 0 ? "Groom" : "Bride",
    //       choosingFor: "Myself",
    //       readTCP: true,
    //       isTestData:true
    //     });
    //     candidateIds.push(candidateId._id);
    //     console.log(`Created candidate ${i}: ${candidateId}`);
    //   } catch (err) {
    //     console.error(`Failed to create candidate ${i}:`, err.message);
    //   }
    // }
    // console.log(`Created ${candidateIds.length} test candidates`);
   

    // console.log('\n=== TEST DATA READY ===');
    // // console.log('Admin IDs:', adminIds);
    // console.log('Candidate IDs (first 10):', candidateIds.slice(0, 10));
    // console.log('\nCopy these IDs into your k6 script.');


  } catch (err) {
    console.error('Seed failed:', err);
    process.exit(1);
  }
}

seed();