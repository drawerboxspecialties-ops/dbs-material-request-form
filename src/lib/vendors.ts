export type Vendor = {
  id: string;
  customerId: string;
  companyName: string;
  contactName: string;
  phone: string;
  fax: string;
  emails: string[];
};

export const VENDORS: Vendor[] = [
  {
    id: "states-industry",
    customerId: "2490",
    companyName: "States Industry",
    contactName: "Shannon",
    phone: "800-626-1981",
    fax: "",
    emails: ["skrzywowiaza@statesind.com"],
  },
  {
    id: "cal-panel",
    customerId: "181500001",
    companyName: "Cal Panel",
    contactName: "Phil",
    phone: "800-451-1745",
    fax: "",
    emails: ["Phil@calpanel.com"],
  },
  {
    id: "forest-plywood",
    customerId: "268289",
    companyName: "Forest Plywood",
    contactName: "Mike",
    phone: "714-523-1721",
    fax: "",
    emails: ["mbronson@forestplywood.com"],
  },
  {
    id: "west-coast",
    customerId: "14887",
    companyName: "West Coast",
    contactName: "Robert",
    phone: "562-906-2489",
    fax: "",
    emails: ["rmacias@ebbradley.com"],
  },
  {
    id: "eb-bradley",
    customerId: "133437",
    companyName: "EB Bradley",
    contactName: "David",
    phone: "562-906-2489",
    fax: "",
    emails: ["dmunoz@ebbradley.com"],
  },
  {
    id: "hardwoods",
    customerId: "DRA42470001",
    companyName: "Hardwoods",
    contactName: "Josh",
    phone: "951-653-9400",
    fax: "",
    emails: ["jsneckner@hardwoods-inc.com", "DSanders@hardwoods-inc.com"],
  },
  {
    id: "national",
    customerId: "61340",
    companyName: "National",
    contactName: "Chris",
    phone: "909-287-7906",
    fax: "",
    emails: ["cdennis@nationalwood.com"],
  },
  {
    id: "patrick-industries",
    customerId: "64253",
    companyName: "Patrick industries / Custom vinyls",
    contactName: "Chris",
    phone: "619-843-5354",
    fax: "909-350-4875",
    emails: ["hinckc@patrickind.com"],
  },
  {
    id: "peterman-lumber",
    customerId: "300019060005",
    companyName: "Peterman Lumber",
    contactName: "Bret",
    phone: "909-357-7730",
    fax: "",
    emails: ["bretr@petermanlumber.com"],
  },
  {
    id: "phillips",
    customerId: "1213",
    companyName: "Phillips",
    contactName: "Dorian",
    phone: "800-649-6410",
    fax: "818-897-6571",
    emails: ["dorian@phillipsplywood.com"],
  },
  {
    id: "royal",
    customerId: "DRA001",
    companyName: "Royal",
    contactName: "Janeen",
    phone: "562-404-2989",
    fax: "",
    emails: ["janeen@royalplywood.com"],
  },
  {
    id: "rugby",
    customerId: "DBS10050001",
    companyName: "Rugby",
    contactName: "Maria",
    phone: "800-472-4202",
    fax: "909-948-0851",
    emails: ["sceriani@rugbyabp.com"],
  },
  {
    id: "sierra",
    customerId: "STADRA65",
    companyName: "Sierra",
    contactName: "Mitchell",
    phone: "800-432-7300",
    fax: "",
    emails: ["mseaford@sierrafp.com"],
  },
  {
    id: "wurth",
    customerId: "1103613",
    companyName: "Wurth",
    contactName: "Mike",
    phone: "562-665-7401",
    fax: "",
    emails: ["mhudson@wurthlac.com"],
  },
];

export function vendorEmailTo(vendor: Vendor) {
  return vendor.emails.join("; ");
}

export function findVendorById(id: string) {
  return VENDORS.find((vendor) => vendor.id === id) ?? null;
}
